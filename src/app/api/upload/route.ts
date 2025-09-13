import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { randomUUID } from 'crypto'
import { extractTextFromPDF } from '@/lib/pdfUtils'

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

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Storage not configured (missing BLOB_READ_WRITE_TOKEN)' }, { status: 500 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique filename with original name preserved
    const fileExtension = '.pdf'
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_') // Sanitize filename
    const uniqueFilename = `${randomUUID()}-${originalName}`

    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, buffer, {
      access: 'public',
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // After upload, extract title via pdfUtils from the blob URL
    let extractedTitle: string | undefined
    try {
      console.log('📄 Starting title extraction for:', file.name)
      const extraction = await extractTextFromPDF(blob.url)
      extractedTitle = extraction.title
      console.log('📄 Extracted title:', extractedTitle)
    } catch (error) {
      console.log('📄 Title extraction failed, using filename fallback:', error)
    }

    // Generate a readable fallback title from the filename if extraction failed
    const generateTitleFromFilename = (raw: string): string => {
      const withoutExt = raw.replace(/\.[^.]+$/i, '')
      const cleaned = withoutExt
        .replace(/[_-]+/g, ' ') // underscores/dashes to spaces
        .replace(/\s+/g, ' ') // collapse spaces
        .trim()
      // Title-case words up to a reasonable length
      const words = cleaned.split(' ').slice(0, 16)
      const titled = words
        .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
        .join(' ')
      return titled.substring(0, 120)
    }

    // Save document metadata to database (use extracted title if available)
    const finalTitle = (extractedTitle && extractedTitle.trim()) || generateTitleFromFilename(file.name)
    console.log('📄 Final title being saved:', finalTitle)
    
    const document = await prisma.document.create({
      data: {
        title: finalTitle,
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
