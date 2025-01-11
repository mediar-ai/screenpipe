'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import type { PaymentMethod } from '@/types/payment';

interface PaymentMethodSelectorProps {
  onSelect: (method: PaymentMethod) => void;
  availableMethods: PaymentMethod[];
}

export function PaymentMethodSelector({
  onSelect,
  availableMethods,
}: PaymentMethodSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Button
        variant="outline"
        size="lg"
        className="h-auto p-6"
        onClick={() => onSelect('wise')}
        disabled={!availableMethods.includes('wise')}
      >
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/wise-logo.svg"
            alt="Wise"
            width={120}
            height={40}
            className="opacity-90"
          />
          <span className="text-sm text-muted-foreground">
            International payments made easy
          </span>
        </div>
      </Button>

      <Button
        variant="outline"
        size="lg"
        className="h-auto p-6"
        onClick={() => onSelect('mercury')}
        disabled={!availableMethods.includes('mercury')}
      >
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/mercury-logo.svg"
            alt="Mercury"
            width={120}
            height={40}
            className="opacity-90"
          />
          <span className="text-sm text-muted-foreground">
            Modern banking for startups
          </span>
        </div>
      </Button>
    </div>
  );
} 