import { readFile } from 'fs/promises'
import pdfParse from '@jchaffin/pdf-parse'

export interface PDFExtractionResult {
  text: string
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  numPages?: number
}

export async function extractTextFromPDF(filePath: string): Promise<PDFExtractionResult> {
  try {
    let dataBuffer: Buffer
    
    // Check if it's a URL (Vercel Blob) or local file path
    if (filePath.startsWith('http')) {
      // Fetch from remote URL
      console.log('📄 Fetching PDF from URL:', filePath)
      const response = await fetch(filePath)
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      dataBuffer = Buffer.from(arrayBuffer)
      console.log('📄 PDF fetched successfully, size:', dataBuffer.length, 'bytes')
    } else {
      // Read from local file
      console.log('📄 Reading PDF from local path:', filePath)
      dataBuffer = await readFile(filePath)
      console.log('📄 PDF read successfully, size:', dataBuffer.length, 'bytes')
    }
    
    // Validate buffer
    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('PDF buffer is empty or invalid')
    }
    
    // Check if it's actually a PDF by looking at the header
    const header = dataBuffer.toString('ascii', 0, 8)
    if (!header.startsWith('%PDF')) {
      throw new Error(`File does not appear to be a valid PDF. Header: ${header}`)
    }
    
    console.log('📄 PDF header validated:', header)
    
    // Parse the PDF
    console.log('📄 Starting PDF parsing...')
    const data = await pdfParse(dataBuffer)
    console.log('📄 PDF parsing completed successfully')
    
    // Extract metadata
    const result: PDFExtractionResult = {
      text: data.text || '',
      title: data.info?.Title || undefined,
      author: data.info?.Author || undefined,
      subject: data.info?.Subject || undefined,
      keywords: data.info?.Keywords ? data.info.Keywords.split(',').map((k: string) => k.trim()) : undefined,
      numPages: data.numpages || undefined
    }
    
    // If no title in metadata, try to extract from first few lines of text
    if (!result.title && result.text) {
      const lines = result.text.split('\n').slice(0, 10); // Check first 10 lines
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Look for lines that could be titles (not too long, starts with capital, not empty)
        if (trimmedLine.length > 3 && 
            trimmedLine.length < 200 && 
            /^[A-Z]/.test(trimmedLine) && 
            !trimmedLine.includes('Abstract') &&
            !trimmedLine.includes('Introduction') &&
            !trimmedLine.includes('Table of Contents') &&
            !trimmedLine.includes('References') &&
            !trimmedLine.includes('Bibliography') &&
            !trimmedLine.includes('Chapter') &&
            !trimmedLine.includes('Section')) {
          result.title = trimmedLine;
          break;
        }
      }
    }
    
    console.log("📄 PDF extraction result:", {
      textLength: result.text.length,
      title: result.title,
      author: result.author,
      numPages: result.numPages,
      hasText: !!result.text,
      textPreview: result.text.substring(0, 100) + '...'
    });
    
    return result
  } catch (error) {
    console.error('❌ Error extracting text from PDF:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        console.error('❌ Network error - PDF URL may be invalid or inaccessible')
      } else if (error.message.includes('PDF buffer is empty')) {
        console.error('❌ PDF file is empty or corrupted')
      } else if (error.message.includes('valid PDF')) {
        console.error('❌ File is not a valid PDF format')
      } else if (error.message.includes('pdf-parse')) {
        console.error('❌ PDF parsing library error - file may be corrupted or password-protected')
      }
    }
    
    return {
      text: `Unable to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      title: undefined
    }
  }
}
