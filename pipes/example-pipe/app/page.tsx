"use client";

import { SettingsProvider } from "@/components/settings-provider";
import { LastOcrImage } from "@/components/last-ocr-image";
import { HealthStatus } from "@/components/health-status";
import { LastUiRecord } from "@/components/last-ui-record";
import { PlaygroundCard } from "@/components/playground-card";
import { ClientOnly } from "@/components/client-only";
import { Inter } from "next/font/google";

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export default function Page() {
  return (
    <SettingsProvider>
      <ClientOnly>
        <div className={`flex flex-col gap-6 items-center justify-center h-full mt-12 px-4 pb-12 ${inter.className}`}>
          <p className="text-xl font-bold">Example pipe</p>
          <PlaygroundCard />
          <LastOcrImage />
          <LastUiRecord />
          <HealthStatus />
        </div>
      </ClientOnly>
    </SettingsProvider>
  );
}
