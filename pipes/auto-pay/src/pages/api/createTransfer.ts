import { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { PaymentInfo } from '@/types/wise';
import { pipe } from '@screenpipe/js';

export const getAutoPaySettings = async () => {
  const settingsManager = pipe.settings;
  const namespaceSettings = await settingsManager?.getNamespaceSettings(
    'auto-pay'
  );

  return {
    wiseApiKey: namespaceSettings?.wiseApiKey || process.env.WISE_API_KEY,
    wiseProfileId:
      namespaceSettings?.wiseProfileId || process.env.WISE_PROFILE_ID,
    enableProduction:
      namespaceSettings?.enableProduction ||
      process.env.NEXT_PUBLIC_USE_PRODUCTION === 'true',
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { wiseApiKey, wiseProfileId, enableProduction } =
    await getAutoPaySettings();

  const WISE_API_URL = enableProduction
    ? 'https://api.transferwise.com'
    : 'https://api.sandbox.transferwise.tech';
  try {
    const { paymentInfo } = req.body as { paymentInfo: PaymentInfo };

    // Create a quote using v3 authenticated quotes endpoint

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
    const profileIdNumber = parseInt(wiseProfileId);
    console.log('0xHypr', 'Profile ID Number:', profileIdNumber);

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
    // print quoteResponse.data
    // random number between 1000 and 9999
    console.log('0xHypr', 'Quote ID:', quoteResponse.data);
    const transferData = {
      targetAccount: recipientResponse.data.id,
      quoteUuid: quoteResponse.data.id,
      customerTransactionId: uuidv4(),
      details: {
        // reference: paymentInfo.referenceNote || "Auto payment",
        // transferPurpose: "verification.transfers.purpose.pay.bills",
        // transferPurposeSubTransferPurpose: "verification.sub.transfers.purpose.pay.bills",
        // sourceOfFunds: "verification.source.of.funds.other"
      },
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

    return res.status(200).json({
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
    return res
      .status(axiosError.response?.status || 500)
      .json(axiosError.response?.data || { message: axiosError.message });
  }
}
