"use client";

import { useState, useMemo, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { ConnectionPanel } from "@/components/connection-panel";
import { ControlPanel } from "@/components/control-panel";
import { SuggestionList } from "@/components/suggestion-list";
import type { ProgressUpdate } from "@/lib/actions/run-bot";
import type { CookieParam } from "puppeteer-core";

export default function Page() {
  const [executablePath, setExecutablePath] = useState<string | null>(null);
  const [cookies, setCookies] = useState<CookieParam[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progresses, setProgresses] = useState<number[]>([100, 100, 100, 100]);

  const isConnected = useMemo(() => cookies.length > 0, [cookies]);
  const progress = useMemo(() => {
    const ongoing = progresses.filter((p) => p < 100);
    if (ongoing.length === 0) {
      return 100;
    } else {
      return ongoing.reduce((a, b) => a + b, 0) / ongoing.length;
    }
  }, [progresses]);

  useEffect(() => {
    const eventSource = new EventSource("/api/progress");

    eventSource.onmessage = (event) => {
      try {
        const update: ProgressUpdate = JSON.parse(event.data);
        setProgresses((prev) =>
          prev.map((p, i) => (i === update.process ? update.value : p)),
        );
      } catch (e) {
        console.error("Failed to set progress:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("Failed to set progress:", e);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  });

  return (
    <div className="flex flex-col lg:h-screen lg:overflow-y-hidden">
      <h1 className="my-12 text-2xl text-center font-bold">SmartTrend</h1>
      <div className="flex flex-col gap-8 lg:flex-row xl:gap-16 h-full px-8 lg:px-16">
        <div className="flex flex-col gap-8 h-full">
          <ConnectionPanel
            executablePath={executablePath}
            setExecutablePath={setExecutablePath}
            setCookies={setCookies}
            isConnected={isConnected}
          />
          <ControlPanel
            executablePath={executablePath}
            cookies={cookies}
            isConnected={isConnected}
            isRunning={isRunning}
            setIsRunning={setIsRunning}
          />
          {isRunning && progress < 100 && <Progress value={progress} />}
        </div>
        <SuggestionList
          cookies={cookies}
          isConnected={isConnected}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
}
