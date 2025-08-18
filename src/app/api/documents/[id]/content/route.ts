import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractTextFromPDF } from '@/lib/pdfUtils'
import { join } from 'path'

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

    // Get document
    const document = await prisma.document.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Extract PDF text content
    const filePath = join(process.cwd(), document.filepath)
    const content = await extractTextFromPDF(filePath)

    return NextResponse.json({ content })
  } catch (error) {
    console.error('Error extracting PDF content:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
