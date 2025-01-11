'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const mercuryPaymentSchema = z.object({
  recipientId: z.string().min(1, 'Recipient ID is required'),
  paymentMethod: z.string().default('ach'),
});

type MercuryPaymentFormData = z.infer<typeof mercuryPaymentSchema>;

export interface MercuryPaymentFormProps {
  onSubmit: (data: MercuryPaymentFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function MercuryPaymentForm({ onSubmit, isSubmitting }: MercuryPaymentFormProps) {
  const form = useForm<MercuryPaymentFormData>({
    resolver: zodResolver(mercuryPaymentSchema),
    defaultValues: {
      paymentMethod: 'ach',
    },
  });

  return (
    <Form {...form}>
      <form id="mercury-payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="recipientId"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Recipient ID</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter recipient ID"
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled
                  value="ACH"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
} 