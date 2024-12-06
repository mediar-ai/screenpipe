import { NextResponse } from 'next/server';
import { startAutomation } from '@/lib/logic_sequence/main_loop';

export async function POST() {
  try {
    // Start the automation in the background
    startAutomation().catch(error => {
      console.error('automation failed:', error);
    });

    return NextResponse.json({ status: 'started' });
  } catch (error) {
    console.error('failed to start workflow:', error);
    return NextResponse.json(
      { error: 'failed to start workflow' },
      { status: 500 }
    );
  }
}