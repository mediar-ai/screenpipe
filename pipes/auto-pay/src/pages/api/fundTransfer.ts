import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getAutoPaySettings } from './createTransfer';

interface FundTransferRequest {
  transferId: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transferId } = req.body as FundTransferRequest;
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

    return res.status(200).json({
      success: true,
      payment: fundResponse.data,
    });
  } catch (err) {
    console.error('Failed to fund transfer:', err);
    return res.status(500).json({
      error: 'Failed to fund transfer',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
