import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractTextFromPDF } from '@/lib/pdfUtils'

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

    const document = await prisma.document.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Extract text from PDF using the filepath (URL from Vercel Blob)
    console.log('📄 Extracting text from document:', document.title, 'at:', document.filepath)
    const pdfContent = await extractTextFromPDF(document.filepath)

    if (!pdfContent.text || pdfContent.text === 'Unable to extract text from PDF') {
      return NextResponse.json({ 
        error: 'Failed to extract text from PDF. The file might be corrupted or password-protected.' 
      }, { status: 500 })
    }

    return NextResponse.json({
      content: pdfContent.text,
      title: pdfContent.title || document.title,
      author: pdfContent.author,
      subject: pdfContent.subject,
      keywords: pdfContent.keywords,
      numPages: pdfContent.numPages,
      documentId: document.id
    })
  } catch (error) {
    console.error('Error extracting PDF content:', error)
    return NextResponse.json(
      { error: 'Failed to extract PDF content' },
      { status: 500 }
    )
  }
}
