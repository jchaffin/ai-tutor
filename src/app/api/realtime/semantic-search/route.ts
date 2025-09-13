import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  let sessionId: string | undefined;
  let utteranceId: string | undefined;
  
  try {
    const { query, documentId, sessionId: reqSessionId, utteranceId: reqUtteranceId } = await request.json();
    sessionId = reqSessionId;
    utteranceId = reqUtteranceId;

    if (!query || !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        results: [], 
        error: 'Missing query or API key',
        sessionId,
        utteranceId 
      });
    }

    // Skip semantic search for very short or meaningless queries
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3 || /^[.!?]+$/.test(cleanQuery)) {
      return NextResponse.json({ 
        results: [], 
        message: 'Query too short or meaningless',
        sessionId,
        utteranceId 
      });
    }

    console.log(`🔍 Real-time semantic search: "${query}" for document ${documentId}`);

    // Generate embedding for the query
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryVector = queryEmbedding.data[0].embedding;

    // Get document chunks with embeddings for this document
    const chunks = await prisma.documentChunk.findMany({
      where: {
        documentId: documentId,
        embedding: { not: Prisma.JsonNull }
      },
      select: {
        id: true,
        text: true,
        page: true,
        embedding: true,
        start: true,
        end: true
      }
    });

    if (chunks.length === 0) {
      return NextResponse.json({ 
        results: [], 
        message: 'No embeddings found for document',
        sessionId,
        utteranceId 
      });
    }

    // Calculate cosine similarity for each chunk
    const results = chunks.map(chunk => {
      const similarity = cosineSimilarity(queryVector, chunk.embedding as number[]);
      return {
        text: chunk.text,
        page: chunk.page,
        similarity,
        startIndex: chunk.start,
        endIndex: chunk.end,
        chunkId: chunk.id
      };
    })
    .filter(result => result.similarity > 0.6) // Lower threshold for real-time
    .sort((a, b) => b.similarity - a.similarity) // Sort by similarity
    .slice(0, 5); // Limit to top 5 for real-time performance

    console.log(`🔍 Found ${results.length} semantic matches for "${query}"`);

    return NextResponse.json({ 
      results,
      query,
      documentId,
      sessionId,
      utteranceId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Real-time semantic search error:', error);
    return NextResponse.json({ 
      results: [], 
      error: 'Semantic search failed',
      sessionId,
      utteranceId 
    });
  }
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
