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
    const dataBuffer = await readFile(filePath)
    const data = await pdfParse(dataBuffer)
    
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
      numPages: result.numPages
    });
    
    return result
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    return {
      text: 'Unable to extract text from PDF',
      title: undefined
    }
  }
}
