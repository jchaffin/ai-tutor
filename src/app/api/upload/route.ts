import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.formData()
    const file: File | null = data.get('file') as unknown as File

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique filename
    const fileExtension = '.pdf'
    const uniqueFilename = `${randomUUID()}${fileExtension}`

    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, buffer, {
      access: 'authenticated',
      contentType: file.type,
    })

    // Save document metadata to database
    const document = await prisma.document.create({
      data: {
        title: file.name.replace('.pdf', ''),
        filename: file.name,
        filepath: blob.url,
        mimeType: file.type,
        size: file.size,
        userId: session.user.id,
      }
    })

    return NextResponse.json({
      message: 'File uploaded successfully',
      documentId: document.id
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
