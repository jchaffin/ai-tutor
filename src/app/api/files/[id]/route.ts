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

    // If filepath is a URL (Vercel Blob), redirect to it
    if (document.filepath.startsWith('http')) {
      return NextResponse.redirect(document.filepath)
    }

    // If filepath is a local path (/uploads/...), serve the file
    if (document.filepath.startsWith('/uploads/')) {
      try {
        const filename = document.filepath.replace('/uploads/', '')
        const filePath = join(process.cwd(), 'uploads', filename)
        
        // Security check - only allow PDF files
        if (!filename.endsWith('.pdf')) {
          return NextResponse.json({ error: 'File type not allowed' }, { status: 403 })
        }
        
        const fileBuffer = await readFile(filePath)
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${document.filename}"`,
          },
        })
      } catch (error) {
        console.error('Error serving local file:', error)
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
    }

    // Fallback for other filepath formats
    return NextResponse.json({ error: 'File is not available' }, { status: 404 })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    )
  }
}
