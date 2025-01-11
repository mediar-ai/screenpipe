import { MercuryPaymentRequest } from '@/types/mercury';

interface CreateMercuryPaymentParams extends MercuryPaymentRequest {
  enableProduction: boolean;
}

export async function createMercuryPayment(params: CreateMercuryPaymentParams) {
  const response = await fetch('/api/createMercuryTransfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      idempotencyKey: crypto.randomUUID(),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create Mercury payment');
  }

  return response.json();
} 