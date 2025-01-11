import { startMessageCheck } from '@/lib/logic-sequence/check-messages';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const result = await startMessageCheck();
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
} 