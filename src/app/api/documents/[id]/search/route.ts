import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as pdfjs from 'pdfjs-dist'
import fs from 'fs'
import path from 'path'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

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

    const { query } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

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

    // Load PDF file
    const filePath = path.join(process.cwd(), 'uploads', `${document.id}.pdf`)
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'PDF file not found' }, { status: 404 })
    }

    const fileBuffer = fs.readFileSync(filePath)
    const pdfDoc = await pdfjs.getDocument({ data: fileBuffer }).promise
    
    const matches = []
    const searchTerm = query.toLowerCase().trim()

    // Search through each page
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()
      
      // Get viewport for coordinate conversion
      const viewport = page.getViewport({ scale: 1.0 })
      
      // Search through text items
      for (const item of textContent.items) {
        if ('str' in item && item.str.toLowerCase().includes(searchTerm)) {
          // Convert PDF coordinates to percentage
          const x = (item.transform[4] / viewport.width) * 100
          const y = ((viewport.height - item.transform[5]) / viewport.height) * 100
          const width = (item.width / viewport.width) * 100
          const height = (item.height / viewport.height) * 100
          
          matches.push({
            page: pageNum,
            x: Math.max(0, Math.min(95, x)),
            y: Math.max(0, Math.min(95, y)),
            width: Math.max(5, Math.min(50, width)),
            height: Math.max(2, Math.min(10, height)),
            text: item.str,
            context: item.str
          })
        }
      }
    }

    return NextResponse.json({
      query,
      matches,
      total: matches.length
    })

  } catch (error) {
    console.error('Error searching PDF:', error)
    return NextResponse.json(
      { error: 'Failed to search PDF' },
      { status: 500 }
    )
  }
}
