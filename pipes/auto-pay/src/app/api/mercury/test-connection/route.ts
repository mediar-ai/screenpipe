import { pipe } from '@screenpipe/js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!pipe?.settings) {
    return NextResponse.json(
      { error: 'Pipe settings manager not found' },
      { status: 500 }
    );
  }

  try {
    const { apiKey } = await request.json();

    // Make test request to Mercury API
    const response = await fetch('https://backend.mercury.com/api/v1/accounts', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mercury API error: ${error}`);
    }

    const { accounts } = await response.json();
    
    if (!accounts?.length) {
      throw new Error('No Mercury accounts found');
    }

    // Save the API key and first account ID
    await pipe.settings.updateNamespaceSettings('auto-pay', {
      mercuryApiKey: apiKey,
      mercuryAccountId: accounts[0].id,
    });

    return NextResponse.json({ 
      success: true,
      accountId: accounts[0].id 
    });
  } catch (error) {
    console.error('Mercury connection error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to connect to Mercury'
      },
      { status: 500 }
    );
  }
} 