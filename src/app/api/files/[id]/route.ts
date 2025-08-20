import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join } from 'path'

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

    // Read the file from disk
    const filePath = join(process.cwd(), document.filepath)
    const fileBuffer = await readFile(filePath)

    // Return file with appropriate headers (convert Buffer → ArrayBuffer)
    const ab = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer
    const blob = new Blob([ab], { type: document.mimeType })
    return new NextResponse(blob, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `inline; filename="${document.filename}"`,
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    )
  }
}
