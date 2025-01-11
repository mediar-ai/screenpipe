import type { PaymentInfo } from './wise';

export interface MercuryPaymentRequest {
  recipientId: string;
  amount: number;
  paymentMethod: 'ach';
  idempotencyKey: string;
}

export interface MercuryPaymentResponse {
  id: string;
  details: {
    internationalWireRoutingInfo: null;
    address: null;
    electronicRoutingInfo: {
      bankName: string;
      accountNumber: string;
      address: {
        region: string;
        address1: string;
        city: string;
        postalCode: string;
        country: string;
        address2: string | null;
      };
      electronicAccountType: string;
      routingNumber: string;
    };
    domesticWireRoutingInfo: null;
  };
  postedAt: string | null;
  dashboardLink: string;
  failedAt: string | null;
  feeId: string | null;
  bankDescription: string;
  kind: string;
  note: string | null;
  counterpartyName: string;
  createdAt: string;
  estimatedDeliveryDate: string;
  counterpartyNickname: string | null;
  externalMemo: string | null;
  reasonForFailure: string | null;
  counterpartyId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
}

export interface MercuryAccount {
  id: string;
  name: string;
}

export interface MercuryRecipient {
  id: string;
  counterpartyName: string;
}

export interface MercuryError {
  error: string;
  message: string;
  details?: unknown;
}

// Convert PaymentInfo to MercuryPaymentRequest
export function toMercuryPaymentRequest(paymentInfo: PaymentInfo): MercuryPaymentRequest {
  if (!paymentInfo.amount || !paymentInfo.recipientId) {
    throw new Error('Amount and recipient ID are required for Mercury payments');
  }

  return {
    recipientId: paymentInfo.recipientId,
    amount: parseFloat(paymentInfo.amount),
    paymentMethod: 'ach',
    idempotencyKey: crypto.randomUUID(),
  };
}
