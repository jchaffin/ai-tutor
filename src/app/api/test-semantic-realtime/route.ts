import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const query = searchParams.get('query') || 'test query';

    if (!documentId) {
      return NextResponse.json({ 
        error: 'Document ID is required',
        usage: 'GET /api/test-semantic-realtime?documentId=YOUR_DOCUMENT_ID&query=YOUR_QUERY'
      });
    }

    console.log(`🧪 Testing semantic search integration for document ${documentId} with query: "${query}"`);

    // Test HTTP endpoint
    const httpResponse = await fetch(`${request.nextUrl.origin}/api/realtime/semantic-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        documentId,
        sessionId: 'test-session',
        utteranceId: 'test-utterance'
      })
    });

    const httpResults = await httpResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Semantic search real-time integration test completed',
      testResults: {
        httpEndpoint: {
          status: httpResponse.status,
          results: httpResults.results?.length || 0,
          query: httpResults.query,
          documentId: httpResults.documentId,
          timestamp: httpResults.timestamp
        }
      },
      integration: {
        httpEndpoint: '/api/realtime/semantic-search',
        websocketEndpoint: '/api/realtime/socket',
        realtimeHook: 'useRealtimeSemanticSearch',
        events: [
          'tutor-highlight-semantic-fragment',
          'semantic-search-completed',
          'semantic-matches-stream'
        ]
      }
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
