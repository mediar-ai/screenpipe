import { NextResponse } from 'next/server';
import axios from 'axios';
import type { PaymentInfo } from '@/types/wise';
import {
  toMercuryPaymentRequest,
  type MercuryPaymentResponse,
} from '@/types/mercury';
import { pipe } from '@screenpipe/js';

const MERCURY_API_URL = 'https://backend.mercury.com/api/v1';

// Mercury API error response type
interface MercuryErrorResponse {
  error: {
    message: string;
    type: string;
  };
}
interface Account {
  id: string;
  accountNumber: string;
  routingNumber: string;
  name: string;
  status: string;
  type: string;
  kind: string;
  legalBusinessName: string;
  availableBalance: number;
  currentBalance: number;
  dashboardLink: string;
  createdAt: string;
}
interface AccountsResponse {
  accounts: Account[];
}

async function getCheckingAccount(mercuryApiKey: string): Promise<Account | null> {
  const accountsUrl = 'https://backend.mercury.com/api/v1/accounts';
  
  const options = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mercuryApiKey}`,
    },
  };

  const accountResponse: AccountsResponse | null = await fetch(accountsUrl, options)
    .then((res) => res.json())
    .then((json) => json as AccountsResponse)
    .catch((err) => {
      console.error('error:' + err);
      return null;
    });

  if (!accountResponse) {
    return null;
  }

  return accountResponse.accounts.find((account) => account.kind === 'checking') || null;
}

export async function POST(request: Request) {
  console.log('Mercury transfer request received');
  try {
    // Get settings and validate API key
    const settings = await pipe.settings.getAll();
    const mercuryApiKey = settings?.customSettings?.['auto-pay']?.mercuryApiKey;

    if (!mercuryApiKey) {
      return NextResponse.json(
        { error: 'Mercury API key not configured' },
        { status: 400 }
      );
    }

    // Get checking account
    const checkingAccount = await getCheckingAccount(mercuryApiKey);
    if (!checkingAccount) {
      return NextResponse.json(
        { error: 'Failed to fetch checking account' },
        { status: 500 }
      );
    }
    console.log('checkingAccount', checkingAccount);

    // Process payment
    const body = await request.json();
    console.log('body', body);
    const { paymentInfo } = body as { paymentInfo: PaymentInfo };
    const mercuryPayment = toMercuryPaymentRequest(paymentInfo);

    console.log('mercuryPayment', mercuryPayment);

    // Create payment request using Mercury's API
    const response = await axios.post<MercuryPaymentResponse>(
      `${MERCURY_API_URL}/account/${checkingAccount.id}/transactions`,
      mercuryPayment,
      {
        headers: {
          Authorization: `Bearer ${mercuryApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return NextResponse.json({
      success: true,
      transfer: response.data,
      transferId: response.data.id,
    });
  } catch (error: any) {
    console.error(
      'Error creating Mercury transfer:',
      error.response?.data || error
    );

    // Handle Mercury API specific errors
    if (error.response?.data?.error) {
      const mercuryError = error.response.data as MercuryErrorResponse;
      return NextResponse.json(
        {
          error: mercuryError.error.message,
          type: mercuryError.error.type,
        },
        { status: error.response.status }
      );
    }

    // Handle network or other errors
    return NextResponse.json(
      {
        error: error.message,
        type: 'INTERNAL_ERROR',
      },
      { status: error.response?.status || 500 }
    );
  }
}
