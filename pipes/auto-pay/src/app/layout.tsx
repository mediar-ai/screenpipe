import Providers from './providers';
import { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  title: 'Auto Pay',
  description: 'Automated payment processing with Screenpipe',
};

export default function RootLayout({
  children,
}: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
