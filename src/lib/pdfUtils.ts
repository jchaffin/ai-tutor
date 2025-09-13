import { readFile } from 'fs/promises'
import { join } from 'path'
import pdfParse from '@jchaffin/pdf-parse'

export interface PDFExtractionResult {
  text: string
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  numPages?: number
}

export function extractTitleCandidates(text: string): string[] {
  if (!text) return [];
  const lines = text
    .split('\n')
    .slice(0, 40)
    .map((l) => l.trim())
    .filter(Boolean);
  const bad = /(submitted to|interspeech|arxiv|preprint|proceedings|workshop|conference|copyright|license|doi|http|www|university|department|school|laboratory|affiliation)/i;
  const named = /^(abstract|introduction|background|related\s+work|methods?|approach|experiments?|results|discussion|conclusions?|references|appendix|baselines?)\b/i;
  return lines
    .filter((l) => l.length >= 8 && l.length <= 160)
    .filter((l) => /[a-zA-Z]/.test(l))
    .filter((l) => /^[A-Z]/.test(l))
    .filter((l) => !bad.test(l))
    .filter((l) => !named.test(l))
    .filter((l) => !/[.:]$/.test(l))
    .filter((l) => l.split(/\s+/).length >= 3)
    .filter((l) => l !== l.toUpperCase());
}

export function extractLikelyTitle(text: string): string | undefined {
  const candidates = extractTitleCandidates(text);
  return candidates[0];
}

export function extractAuthorCandidates(text: string, title?: string): string[] {
  if (!text) return []
  const lines = text.split('\n').slice(0, 60).map(l => l.trim())
  // If we know the title, start looking just after it
  let startIdx = 0
  if (title) {
    const idx = lines.findIndex(l => l === title)
    if (idx >= 0) startIdx = Math.min(idx + 1, lines.length - 1)
  }

  // Consider a small window after the title
  const windowLines = lines.slice(startIdx, startIdx + 10)
  // Join consecutive non-empty lines until a blank appears
  let block: string[] = []
  for (const l of windowLines) {
    if (!l) break
    // skip venue/footer style lines
    if (/(submitted to|interspeech|arxiv|preprint|proceedings)/i.test(l)) continue
    block.push(l)
    // stop early if we collected enough text
    if (block.join(' ').length > 200) break
  }
  const merged = block.join(' ')

  // Strip emails, affiliations markers, and footnote symbols
  let cleaned = merged
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, ' ')
    .replace(/\d+|\*|†|‡|§|¶|‖|‗|\^/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Extract sequences of capitalized names separated by commas/and
  // Example: "Yassir Fathullah, Chunyang Wu, Yuan Sun and Jane O'Connor"
  const namePattern = /([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,3})/g
  const rawParts = cleaned.split(/\s+(?:and|&|,|;|\band\b)\s+/i)
  const candidates: string[] = []
  for (const part of rawParts) {
    const m = part.match(namePattern)
    if (m && m.length) {
      const candidate = m.join(' ').trim()
      // Heuristic: at least two words, not all caps, reasonable length
      const wc = candidate.split(/\s+/).length
      if (wc >= 2 && wc <= 5 && candidate !== candidate.toUpperCase()) {
        candidates.push(candidate)
      }
    }
  }
  // Deduplicate while preserving order
  const seen = new Set<string>()
  return candidates.filter(n => (seen.has(n) ? false : (seen.add(n), true)))
}

export function extractLikelyAuthors(text: string, title?: string): string | undefined {
  const names = extractAuthorCandidates(text, title)
  if (names.length === 0) return undefined
  // Join top few names
  return names.slice(0, 8).join(', ')
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
      let actualFilePath = filePath
      
      // If it's a relative path starting with /uploads/, make it absolute
      if (filePath.startsWith('/uploads/')) {
        const filename = filePath.replace('/uploads/', '')
        actualFilePath = join(process.cwd(), 'uploads', filename)
      }
      
      console.log('📄 Reading PDF from local path:', actualFilePath)
      dataBuffer = await readFile(actualFilePath)
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

    // If metadata title is a venue/submission marker, discard it so we can extract a real title from text
    const badMetaTitle = /(submitted to|interspeech|arxiv|preprint|proceedings|workshop|conference)/i
    if (result.title && badMetaTitle.test(result.title)) {
      result.title = undefined
    }
    
    // If no title in metadata, try to extract from the first few lines of text with stricter heuristics
    if (!result.title && result.text) {
      const first = extractTitleCandidates(result.text)[0]
      if (first) result.title = first
    }

    // Author extraction: prefer metadata unless it's generic/noisy; otherwise parse from text
    const badAuthor = /(withheld|anonymous|n\/?a|not available)/i
    if ((!result.author || badAuthor.test(String(result.author))) && result.text) {
      const parsedAuthors = extractLikelyAuthors(result.text, result.title)
      if (parsedAuthors) result.author = parsedAuthors
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
