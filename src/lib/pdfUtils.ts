import { readFile } from 'fs/promises'
import pdfParse from '@jchaffin/pdf-parse'

export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const dataBuffer = await readFile(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    return 'Unable to extract text from PDF'
  }
}
