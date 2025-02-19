"use client";

import { useState, useMemo, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import type { ProgressUpdate } from "@/app/api/progress/route";

const STATUSES = [
  "Reading your profile...",
  "Analyzing OCR data...",
  "Reading your timeline...",
  "Summarizing data...",
  "Creating suggestions...",
];

interface Props {
  isRunning: boolean;
}

export function Status({ isRunning }: Props) {
  const [progresses, setProgresses] = useState<number[]>([
    100, 100, 100, 100, 100,
  ]);

  const progress = useMemo(() => {
    const ongoing = progresses.filter((p) => p < 100);
    if (ongoing.length === 0) {
      return 100;
    } else {
      return ongoing.reduce((a, b) => a + b, 0) / ongoing.length;
    }
  }, [progresses]);

  const statuses = useMemo(() => {
    return progresses
      .map((p, i) => [p, i])
      .filter(([p, _]) => p < 100)
      .map(([_, i]) => STATUSES[i]);
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
  }, []);

  return (
    <div>
      {isRunning && progress < 100 && <Progress value={progress} />}
      {isRunning && statuses.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4">
          {statuses.map((status, i) => (
            <li key={i}>{status}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
