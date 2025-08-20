import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromPDF } from '@/lib/pdfUtils'

export async function POST(request: NextRequest) {
  try {
    const { fileUrl } = await request.json()
    
    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 })
    }
    
    console.log('🧪 Testing PDF extraction for:', fileUrl)
    
    const result = await extractTextFromPDF(fileUrl)
    
    return NextResponse.json({
      success: true,
      result: {
        textLength: result.text.length,
        title: result.title,
        author: result.author,
        numPages: result.numPages,
        hasText: !!result.text,
        textPreview: result.text.substring(0, 200) + '...',
        fullText: result.text
      }
    })
  } catch (error) {
    console.error('🧪 Test PDF extraction error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
