import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { query, documentId } = await request.json();

    if (!query || !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ results: [] });
    }

    // Skip semantic search for very short or meaningless queries
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3 || /^[.!?]+$/.test(cleanQuery)) {
      return NextResponse.json({ 
        results: [], 
        message: 'Query too short or meaningless'
      });
    }

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
      return NextResponse.json({ results: [] });
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
    .filter(result => result.similarity > 0.7) // Only return highly similar results
    .sort((a, b) => b.similarity - a.similarity) // Sort by similarity
    .slice(0, 10); // Limit to top 10 results

    return NextResponse.json({ results });

  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json({ results: [] });
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
