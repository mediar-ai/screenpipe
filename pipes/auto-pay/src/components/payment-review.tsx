'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ReloadIcon } from '@radix-ui/react-icons';
import { WisePaymentForm } from './wise-payment-form';
import { MercuryPaymentForm } from './mercury-payment-form';
import { PaymentMethodSelector } from './payment-method-selector';
import type { PaymentDetails, PaymentMethod } from '@/types/payment';

interface PaymentReviewProps {
  paymentDetails: PaymentDetails;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentDetailsChange: (details: PaymentDetails) => void;
  onRefresh: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  availableMethods: PaymentMethod[];
}

export function PaymentReview({
  paymentDetails,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  onRefresh,
  onSubmit,
  isSubmitting,
  availableMethods,
}: PaymentReviewProps) {
  return (
    <div className="space-y-4">
      {availableMethods.length > 1 && (
        <PaymentMethodSelector
          onSelect={onPaymentMethodChange}
          availableMethods={availableMethods}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Review Payment Details</CardTitle>
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <ReloadIcon className="mr-2 h-4 w-4" />
              Refresh Details
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paymentDetails.method === 'wise' && paymentDetails.wise && (
            <WisePaymentForm
              paymentInfo={paymentDetails.wise}
              onChange={(wise) =>
                onPaymentDetailsChange({ ...paymentDetails, wise })
              }
            />
          )}

          {paymentDetails.method === 'mercury' && paymentDetails.mercury && (
            <MercuryPaymentForm
              paymentInfo={paymentDetails.mercury}
              onChange={(mercury) =>
                onPaymentDetailsChange({ ...paymentDetails, mercury })
              }
            />
          )}
        </CardContent>
        <CardFooter>
          <Button
            className="ml-auto"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting && (
              <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Transfer
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 