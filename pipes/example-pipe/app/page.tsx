"use client";

import { SettingsProvider } from "@/lib/settings-provider";
import { LastOcrImage } from "@/components/ready-to-use-examples/last-ocr-image";
import { HealthStatus } from "@/components/ready-to-use-examples/health-status";
import { LastUiRecord } from "@/components/ready-to-use-examples/last-ui-record";
import { PlaygroundCard } from "@/components/playground-card";
import { ClientOnly } from "@/lib/client-only";
import { Inter } from "next/font/google";
import healthStatusContent from '../content/health-status-card.json';

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
          <h1 className="text-2xl font-bold mb-0">example pipe</h1>
          <p className="text-gray-600 mb-2 -mt-5">ready to use components powered by screenpipe</p>
          {healthStatusContent.map((cardContent, index) => (
            <PlaygroundCard key={index} content={cardContent} />
          ))}
        </div>
      </ClientOnly>
    </SettingsProvider>
  );
}
