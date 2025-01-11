import { pipe } from '@screenpipe/js';

export interface MercuryConfig {
  apiKey: string;
  accountId: string;
  host: string;
}

export interface MercuryAccount {
  id: string;
  name: string;
}

export interface MercuryRecipient {
  id: string;
  counterpartyName: string;
}

/**
 * Get the Mercury environment configuration
 * Returns null if not configured
 */
export async function getMercuryConfig(): Promise<MercuryConfig | null> {
  if (!pipe?.settings) {
    throw new Error('Pipe settings manager not found');
  }

  const settings = await pipe.settings.getNamespaceSettings('auto-pay');
  if (!settings?.mercuryApiKey || !settings?.mercuryAccountId) {
    return null;
  }

  return {
    apiKey: settings.mercuryApiKey,
    accountId: settings.mercuryAccountId,
    host: 'https://backend.mercury.com/api/v1',
  };
}

/**
 * Make an authenticated request to the Mercury API
 */
export async function makeMercuryRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await getMercuryConfig();
  if (!config) {
    throw new Error('Missing Mercury configuration');
  }

  const response = await fetch(`${config.host}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mercury API error: ${error}`);
  }

  return response.json();
}

/**
 * Get Mercury accounts
 */
export async function getMercuryAccounts(): Promise<MercuryAccount[]> {
  const response = await makeMercuryRequest<{ accounts: MercuryAccount[] }>('/accounts');
  return response.accounts;
}

/**
 * Get Mercury recipients
 */
export async function getMercuryRecipients(): Promise<MercuryRecipient[]> {
  const response = await makeMercuryRequest<{ recipients: MercuryRecipient[] }>('/recipients');
  return response.recipients;
}

/**
 * Send an ACH payment
 */
export async function sendACHPayment(params: {
  recipientId: string;
  amount: number;
  idempotencyKey: string;
}) {
  const config = await getMercuryConfig();
  if (!config) {
    throw new Error('Missing Mercury configuration');
  }

  return makeMercuryRequest(`/account/${config.accountId}/transactions`, {
    method: 'POST',
    body: JSON.stringify({
      recipientId: params.recipientId,
      amount: params.amount,
      paymentMethod: 'ach',
      idempotencyKey: params.idempotencyKey,
    }),
  });
} 