import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { PaymentInfo } from '@/types/wise';
import { getAutoPaySettings } from '@/app/api/lib';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { wiseApiKey, wiseProfileId, enableProduction } =
    await getAutoPaySettings();

  const WISE_API_URL = enableProduction
    ? 'https://api.transferwise.com'
    : 'https://api.sandbox.transferwise.tech';
  try {
    const { paymentInfo } = (await request.json()) as {
      paymentInfo: PaymentInfo;
    };

    // Create a quote using v3 authenticated quotes endpoint
    console.log('0xHypr', 'Creating quote');
    const quoteData = {
      sourceCurrency: paymentInfo.currency,
      targetCurrency: paymentInfo.currency,
      sourceAmount: parseFloat(paymentInfo.amount),
      payOut: 'BANK_TRANSFER',
      preferredPayIn: 'BANK_TRANSFER',
      paymentMetadata: {
        transferNature: 'MOVING_MONEY_BETWEEN_OWN_ACCOUNTS',
      },
    };

    console.log('0xHypr', 'Quote request data:', quoteData);
    console.log('0xHypr', 'Wise API Key:', wiseApiKey);
    console.log('0xHypr', 'Wise Profile ID:', wiseProfileId);

    // remove letters from profile id
    const profileIdNumber = parseInt(wiseProfileId.replace(/[a-zA-Z]/g, ''));
    console.log('0xHypr', 'Profile ID Number:', profileIdNumber);
    // log a curl command to create the quote
    console.log(
      '0xHypr',
      `curl -X POST "${WISE_API_URL}/v3/profiles/${profileIdNumber}/quotes" -H "Authorization: Bearer ${wiseApiKey}" -H "Content-Type: application/json" -d '${JSON.stringify(
        quoteData
      )}'`
    );

    const quoteResponse = await axios.post(
      `${WISE_API_URL}/v3/profiles/${profileIdNumber}/quotes`,
      quoteData,
      {
        headers: {
          Authorization: `Bearer ${wiseApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('0xHypr', 'Quote created:', quoteResponse.data);

    // Create recipient account
    console.log('0xHypr', 'Creating recipient account');
    const recipientData = {
      currency: paymentInfo.currency,
      type:
        paymentInfo.accountNumber && paymentInfo.routingNumber
          ? 'aba'
          : 'email',
      profile: profileIdNumber,
      accountHolderName: paymentInfo.recipientName,
      ...(paymentInfo.accountNumber && paymentInfo.routingNumber
        ? {
            details: {
              legalType: 'PRIVATE',
              accountType: 'CHECKING',
              accountNumber: paymentInfo.accountNumber,
              abartn: paymentInfo.routingNumber,
              address: {
                country: 'US',
                city: 'New York',
                state: 'NY',
                postCode: '10001',
                firstLine: '123 Main St',
              },
            },
          }
        : {
            details: {
              email:
                paymentInfo.recipientEmail ||
                `${paymentInfo.recipientName
                  .toLowerCase()
                  .replace(/\s+/g, '.')}@example.com`,
            },
          }),
    };

    const recipientResponse = await axios.post(
      `${WISE_API_URL}/v1/accounts`,
      recipientData,
      {
        headers: {
          Authorization: `Bearer ${wiseApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('0xHypr', 'Recipient created:', recipientResponse.data);

    // Update quote with recipient
    console.log('0xHypr', 'Updating quote with recipient');
    await axios.patch(
      `${WISE_API_URL}/v3/profiles/${profileIdNumber}/quotes/${quoteResponse.data.id}`,
      {
        targetAccount: recipientResponse.data.id,
        payOut: 'BANK_TRANSFER',
      },
      {
        headers: {
          Authorization: `Bearer ${wiseApiKey}`,
          'Content-Type': 'application/merge-patch+json',
        },
      }
    );

    // Create transfer with the improved logic
    console.log('0xHypr', 'Creating transfer');
    const transferData = {
      targetAccount: recipientResponse.data.id,
      quoteUuid: quoteResponse.data.id,
      customerTransactionId: uuidv4(),
      details: {},
      originator: {
        type: 'ACCOUNT',
        id: '1234567890',
      },
    };

    console.log('0xHypr', 'Transfer data:', transferData);

    const transferResponse = await axios.post(
      `${WISE_API_URL}/v1/transfers`,
      transferData,
      {
        headers: {
          Authorization: `Bearer ${wiseApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('0xHypr', 'Transfer response:', transferResponse.data);

    // Fund the transfer
    if (transferResponse.data.id) {
      console.log('0xHypr', 'Funding transfer');
      await axios.post(
        `${WISE_API_URL}/v3/profiles/${profileIdNumber}/transfers/${transferResponse.data.id}/payments`,
        {
          type: 'BALANCE',
        },
        {
          headers: {
            Authorization: `Bearer ${wiseApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('0xHypr', 'Transfer funded');
    }

    return NextResponse.json({
      success: true,
      transfer: transferResponse.data,
      transferId: transferResponse.data.id,
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(
      '0xHypr Error creating transfer:',
      axiosError.response?.data || axiosError
    );
    return NextResponse.json(
      axiosError.response?.data || { message: axiosError.message },
      { status: axiosError.response?.status || 500 }
    );
  }
}
