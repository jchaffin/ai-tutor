import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'
import { extractTextFromPDF } from '@/lib/pdfUtils'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Get all user documents without chunks
    const documents = await prisma.document.findMany({
      where: {
        userId: session.user.id,
        chunks: { none: {} } // Documents with no chunks
      },
      select: { id: true, filepath: true, title: true }
    })

    if (documents.length === 0) {
      return NextResponse.json({ message: 'No documents need embedding' })
    }

    let processed = 0
    for (const doc of documents) {
      try {
        const extraction = await extractTextFromPDF(doc.filepath)
        const fullText = (extraction.text || '').replace(/\u0000/g, '').trim()
        if (fullText.length === 0) continue

        // Basic sentence segmentation
        const sentences: Array<{ text: string; start: number; end: number }> = []
        {
          const re = /[.!?]+[\)\]\"']?\s+|\n{2,}/g
          let last = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(fullText)) !== null) {
            const end = m.index + m[0].length
            const raw = fullText.slice(last, end)
            const trimmed = raw.trim()
            if (trimmed.length >= 16) {
              sentences.push({ text: raw, start: last, end })
            }
            last = end
          }
          const tail = fullText.slice(last)
          if (tail.trim().length >= 16) sentences.push({ text: tail, start: last, end: fullText.length })
        }

        // Limit very long sentences
        const normalized: Array<{ idx: number; text: string; start: number; end: number }> = []
        let idxCounter = 0
        for (const s of sentences) {
          if (s.text.length <= 500) {
            normalized.push({ idx: idxCounter++, text: s.text.trim(), start: s.start, end: s.end })
          } else {
            let c = s.start
            while (c < s.end) {
              const e = Math.min(s.end, c + 500)
              const part = fullText.slice(c, e)
              normalized.push({ idx: idxCounter++, text: part.trim(), start: c, end: e })
              c = e
            }
          }
        }

        // Embed and store
        for (const ch of normalized) {
          const emb = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: ch.text
          })
          const embedding = emb.data[0].embedding
          await prisma.documentChunk.create({
            data: {
              documentId: doc.id,
              idx: ch.idx,
              text: ch.text,
              start: ch.start,
              end: ch.end,
              embedding
            }
          })
        }
        processed++
        console.log(`🧠 Embedded ${normalized.length} chunks for document ${doc.id} (${doc.title})`)
      } catch (err) {
        console.error(`❌ Failed to embed document ${doc.id}:`, err)
      }
    }

    return NextResponse.json({
      message: `Processed ${processed} documents`,
      total: documents.length
    })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
