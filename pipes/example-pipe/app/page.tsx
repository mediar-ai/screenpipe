"use client";

import { SettingsProvider } from "@/lib/settings-provider";
import { LastOcrImage } from "@/components/ready-to-use-examples/last-ocr-image";
import { HealthStatus } from "@/components/ready-to-use-examples/health-status";
import { LastUiRecord } from "@/components/ready-to-use-examples/last-ui-record";
import { PlaygroundCard } from "@/components/playground-card";
import { ClientOnly } from "@/lib/client-only";
import { Inter } from "next/font/google";
import healthStatusContent from '../content/health-status-card.json';
import { useEffect, useState } from "react";

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

interface Pipe {
  id: string;
  name: string;
  description: string;
}

export default function Page() {
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://screenpi.pe/api/plugins/registry")
      .then((res) => res.json())
      .then((data) => {
        const transformedPipes = data.map((pipe: any) => ({
          id: pipe.id,
          name: pipe.name,
          description: pipe.description?.split('\n')[0] || ''
        }));
        setPipes(transformedPipes);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching pipes:", error);
        setLoading(false);
      });
  }, []);

  return (
    <SettingsProvider>
      <ClientOnly>
        <div className={`flex flex-col gap-6 items-center justify-center h-full mt-12 px-4 pb-12 ${inter.className}`}>
          <h1 className="text-2xl font-bold mb-0">example app (pipe) for developers</h1>
          <p className="text-gray-600 mb-2 -mt-5">ready-to-use components for engineers building apps with screenpipe</p>
          {healthStatusContent.map((cardContent, index) => (
            <PlaygroundCard key={index} content={cardContent} />
          ))}
          
          <div className="w-full max-w-4xl mt-8 font-mono">
            <h2 className="text-xl font-semibold mb-4 text-left">open source pipes</h2>
            <p className="mb-6 text-left text-gray-600">
              # All pipes are open source and you can directly fork or reuse pipes or components.
              # Source: <a href="https://github.com/mediar-ai/screenpipe/tree/main/pipes" className="text-blue-500 underline">https://github.com/mediar-ai/screenpipe/tree/main/pipes</a>
            </p>
            
            {loading ? (
              <p className="text-gray-500">Loading available pipes...</p>
            ) : (
              <div className="bg-gray-100 p-4 rounded w-full max-w-4xl text-sm border border-gray-200">
                {pipes.map((pipe, index) => (
                  <div key={index} className="mb-2 last:mb-0">
                    <span className="font-medium">[{index}]</span> <span className="font-semibold">{pipe.name}</span> - {pipe.description}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ClientOnly>
    </SettingsProvider>
  );
}
