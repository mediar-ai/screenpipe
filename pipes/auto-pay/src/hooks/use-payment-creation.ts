import { useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import type { MercuryPaymentRequest } from '@/types/mercury';

interface UsePaymentCreationResult {
  isCreating: boolean;
  createPayment: (paymentInfo: MercuryPaymentRequest) => Promise<void>;
}

export function usePaymentCreation(): UsePaymentCreationResult {
  const [isCreating, setIsCreating] = useState(false);

  const createPayment = async (paymentInfo: MercuryPaymentRequest) => {
    setIsCreating(true);

    try {
      const response = await fetch('/api/createMercuryPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentInfo }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create payment');
      }

      const data = await response.json();
      
      toast({
        title: 'Payment Created',
        description: 'The payment has been created successfully.',
      });

      // Open Mercury dashboard link in new tab if available
      if (data.dashboardLink) {
        window.open(data.dashboardLink, '_blank');
      }

    } catch (error) {
      console.error('Payment creation error:', error);
      toast({
        title: 'Payment Failed',
        description: error instanceof Error ? error.message : 'Failed to create payment',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return {
    isCreating,
    createPayment,
  };
} 