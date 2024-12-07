import { NextResponse } from 'next/server';
import { startAutomation } from '@/lib/logic_sequence/intro_requester';

export async function POST(request: Request) {
  try {
    const { mode } = await request.json();
    const maxProfiles = mode === 'test' ? 1 : Infinity; // full run will process all profiles

    // start the automation in the background
    startAutomation(maxProfiles).catch(error => {
      console.error('automation failed:', error);
    });

    return NextResponse.json({ status: 'started', mode });
  } catch (error) {
    console.error('failed to start workflow:', error);
    return NextResponse.json(
      { error: 'failed to start workflow' },
      { status: 500 }
    );
  }
}