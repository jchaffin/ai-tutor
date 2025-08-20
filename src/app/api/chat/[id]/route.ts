import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'
import { PDFAnnotation } from '@/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    
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
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, currentPage, newSession } = await request.json()

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

    // Get most recent chat session, or create a new one when explicitly requested
    let chatSession = await prisma.chatSession.findFirst({
      where: {
        documentId: id,
        userId: session.user.id
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!chatSession || newSession === true) {
      chatSession = await prisma.chatSession.create({
        data: {
          documentId: id,
          userId: session.user.id
        }
      })
    }

    // Fetch PDF content from the content API
    const contentResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/documents/${id}/content`, {
      headers: {
        'Cookie': request.headers.get('cookie') || ''
      }
    })

    if (!contentResponse.ok) {
      const errorData = await contentResponse.json()
      return NextResponse.json({ 
        error: errorData.error || 'Failed to extract PDF content' 
      }, { status: 500 })
    }

    const pdfContent = await contentResponse.json()

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
${pdfContent.content}

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
          const annotationJson = match.replace('ANNOTATION:', '').trim()
          const annotation = JSON.parse(annotationJson)
          
          // Validate annotation data
          if (annotation.page && annotation.x !== undefined && annotation.y !== undefined && 
              annotation.width !== undefined && annotation.height !== undefined && annotation.type) {
            annotations.push({
              id: `temp-${Date.now()}-${Math.random()}`,
              page: annotation.page,
              x: annotation.x,
              y: annotation.y,
              width: annotation.width,
              height: annotation.height,
              type: annotation.type,
              color: annotation.color || '#ffff00',
              text: annotation.text || ''
            })
          }
          
          // Remove annotation command from response
          cleanResponse = cleanResponse.replace(match, '').trim()
        } catch (parseError) {
          console.error('Error parsing annotation JSON:', parseError)
        }
      }
    }

    // Save user message
    await prisma.message.create({
      data: {
        chatSessionId: chatSession.id,
        role: 'user',
        content: message
      }
    })

    // Save AI response
    const aiMessage = await prisma.message.create({
      data: {
        chatSessionId: chatSession.id,
        role: 'assistant',
        content: cleanResponse
      }
    })

    // Save annotations if any
    if (annotations.length > 0) {
      for (const annotation of annotations) {
        await prisma.annotation.create({
          data: {
            messageId: aiMessage.id,
            page: annotation.page,
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            type: annotation.type,
            color: annotation.color,
            text: annotation.text
          }
        })
      }
    }

    return NextResponse.json({
      message: cleanResponse,
      navigateToPage,
      annotations: annotations.map(ann => ({
        ...ann,
        id: `temp-${Date.now()}-${Math.random()}`
      }))
    })
  } catch (error) {
    console.error('Error processing chat message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
