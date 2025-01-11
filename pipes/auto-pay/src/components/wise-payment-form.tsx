'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const wisePaymentSchema = z.object({
  recipientName: z.string().min(1, 'Recipient name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  routingNumber: z.string().min(9, 'Routing number must be 9 digits').max(9),
  reference: z.string().optional(),
});

type WisePaymentFormData = z.infer<typeof wisePaymentSchema>;

export interface WisePaymentFormProps {
  onSubmit: (data: WisePaymentFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function WisePaymentForm({ onSubmit, isSubmitting }: WisePaymentFormProps) {
  const form = useForm<WisePaymentFormData>({
    resolver: zodResolver(wisePaymentSchema),
  });

  return (
    <Form {...form}>
      <form id="wise-payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="recipientName"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Recipient Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter recipient name"
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accountNumber"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Account Number</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter account number"
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="routingNumber"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Routing Number</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter 9-digit routing number"
                  maxLength={9}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reference"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Reference (Optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter payment reference"
                  disabled={isSubmitting}
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