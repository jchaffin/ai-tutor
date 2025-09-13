import { NextResponse } from "next/server";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`OpenAI API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.client_secret?.value) {
      console.error('Invalid response from OpenAI API:', data);
      return NextResponse.json({ error: 'Invalid response from OpenAI' }, { status: 500 });
    }

    console.log('✅ Ephemeral key created successfully');
    return NextResponse.json({ ephemeralKey: data.client_secret.value });
  } catch (error) {
    console.error('❌ Error creating ephemeral key:', error);
    return NextResponse.json({ 
      error: 'Failed to create ephemeral key',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
