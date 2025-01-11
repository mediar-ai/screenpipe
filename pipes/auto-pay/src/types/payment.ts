import type { WisePaymentInfo } from './wise';
import type { MercuryPaymentRequest } from './mercury';

export type PaymentMethod = 'wise' | 'mercury';

export interface PaymentDetails {
  method: PaymentMethod;
  wise?: WisePaymentInfo;
  mercury?: MercuryPaymentRequest;
}

export interface TransferDetails {
  id: string;
  status: string;
  trackingUrl: string;
  provider: PaymentMethod;
} 