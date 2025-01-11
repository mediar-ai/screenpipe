import axios from 'axios';
import { getAutoPaySettings } from '@/lib/auto-pay-settings';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FundTransferRequest {
  transferId: string;
}

export async function POST(request: Request) {
  try {
    const { transferId } = await request.json() as FundTransferRequest;
    const { wiseApiKey, wiseProfileId, enableProduction } =
      await getAutoPaySettings();
    // Get Wise API token and profile ID from environment variables
    const wiseToken = wiseApiKey;
    const profileId = wiseProfileId;

    if (!wiseToken || !profileId) {
      throw new Error('Missing Wise API configuration');
    }

    const WISE_API_URL = enableProduction
      ? 'https://api.transferwise.com'
      : 'https://api.sandbox.transferwise.tech';
    // Fund the transfer from the balance account
    const fundResponse = await axios.post(
      `${WISE_API_URL}/v3/profiles/${profileId}/transfers/${transferId}/payments`,
      {
        type: 'BALANCE',
      },
      {
        headers: {
          Authorization: `Bearer ${wiseToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return NextResponse.json({
      success: true,
      payment: fundResponse.data,
    });
  } catch (err) {
    console.error('Failed to fund transfer:', err);
    return NextResponse.json(
      {
        error: 'Failed to fund transfer',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
} 