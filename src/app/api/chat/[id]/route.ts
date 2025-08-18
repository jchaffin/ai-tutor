import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { extractTextFromPDF } from '@/lib/pdfUtils'
import { join } from 'path'
import { PDFAnnotation } from '@/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get chat session for this document
    const chatSession = await prisma.chatSession.findFirst({
      where: {
        documentId: id,
        userId: session.user.id
      },
      include: {
        messages: {
          include: {
            annotations: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    if (!chatSession) {
      return NextResponse.json({ messages: [], annotations: [] })
    }

    // Transform data for frontend
    const messages = chatSession.messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt
    }))

    const annotations = chatSession.messages.flatMap(msg => 
      msg.annotations.map(ann => ({
        id: ann.id,
        page: ann.page,
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        type: ann.type,
        color: ann.color,
        text: ann.text
      }))
    )

    return NextResponse.json({ messages, annotations })
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, currentPage } = await request.json()

    // Get document
    const document = await prisma.document.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get or create chat session
    let chatSession = await prisma.chatSession.findFirst({
      where: {
        documentId: id,
        userId: session.user.id
      }
    })

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          documentId: id,
          userId: session.user.id
        }
      })
    }

    // Extract PDF text for context
    const filePath = join(process.cwd(), document.filepath)
    const pdfText = await extractTextFromPDF(filePath)

    // Get recent messages for context
    const recentMessages = await prisma.message.findMany({
      where: {
        chatSessionId: chatSession.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    })

    // Build conversation context
    const conversationHistory = recentMessages
      .reverse()
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n')

    // Create AI prompt
    const systemPrompt = `You are an AI tutor helping a student understand a PDF document. You can:
1. Answer questions about the document content
2. Provide explanations and clarifications
3. Navigate to specific pages by saying "NAVIGATE_TO_PAGE: X" where X is the page number
4. Highlight important text by providing annotations

Document title: ${document.title}
Current page: ${currentPage}

Document content:
${pdfText}

Previous conversation:
${conversationHistory}

When you want to highlight or annotate something:
- Use ANNOTATION: followed by JSON with page, x, y, width, height (as percentages), type, color, and optional text
- Types: highlight, circle, rectangle
- Colors: hex codes like #ffff00

Respond naturally and helpfully to the student's question.`

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 1000,
      temperature: 0.7
    })

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.'

    // Parse AI response for special commands
    let navigateToPage = null
    const annotations: PDFAnnotation[] = []
    let cleanResponse = aiResponse

    // Check for navigation command
    const navMatch = aiResponse.match(/NAVIGATE_TO_PAGE:\s*(\d+)/g)
    if (navMatch) {
      const pageNum = parseInt(navMatch[0].replace('NAVIGATE_TO_PAGE:', '').trim())
      navigateToPage = pageNum
      cleanResponse = cleanResponse.replace(/NAVIGATE_TO_PAGE:\s*\d+/g, '').trim()
    }

    // Check for annotation commands
    const annotationMatches = aiResponse.match(/ANNOTATION:\s*(\{[^}]+\})/g)
    if (annotationMatches) {
      for (const match of annotationMatches) {
        try {
          const annotationData = JSON.parse(match.replace('ANNOTATION:', '').trim())
          annotations.push(annotationData)
        } catch (e) {
          console.error('Failed to parse annotation:', e)
        }
      }
      cleanResponse = cleanResponse.replace(/ANNOTATION:\s*\{[^}]+\}/g, '').trim()
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        chatSessionId: chatSession.id,
        role: 'user',
        content: message
      }
    })

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        chatSessionId: chatSession.id,
        role: 'assistant',
        content: cleanResponse
      }
    })

    // Save annotations
    const savedAnnotations = []
    for (const annotation of annotations) {
      const savedAnnotation = await prisma.annotation.create({
        data: {
          messageId: assistantMessage.id,
          page: annotation.page || currentPage,
          x: annotation.x || 0,
          y: annotation.y || 0,
          width: annotation.width || 10,
          height: annotation.height || 5,
          type: annotation.type || 'highlight',
          color: annotation.color || '#ffff00',
          text: annotation.text
        }
      })
      savedAnnotations.push({
        id: savedAnnotation.id,
        page: savedAnnotation.page,
        x: savedAnnotation.x,
        y: savedAnnotation.y,
        width: savedAnnotation.width,
        height: savedAnnotation.height,
        type: savedAnnotation.type,
        color: savedAnnotation.color,
        text: savedAnnotation.text
      })
    }

    return NextResponse.json({
      response: cleanResponse,
      navigateToPage,
      annotations: savedAnnotations
    })
  } catch (error) {
    console.error('Error processing chat message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
