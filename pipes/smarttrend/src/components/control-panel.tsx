"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconPlus, IconStop } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/lib/settings-provider";
import { runBot, stopBot } from "@/lib/actions/run-bot";
import type { CookieParam } from "puppeteer-core";

interface Props {
  cookies: CookieParam[];
  isConnected: boolean;
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  frequency: number;
  prompt: string;
}

export function ControlPanel({
  cookies,
  isConnected,
  isRunning,
  setIsRunning,
  frequency,
  prompt,
}: Props) {
  const { settings } = useSettings();

  const start = async () => {
    if (settings && settings.screenpipeAppSettings) {
      const success = await runBot(
        settings.screenpipeAppSettings,
        cookies,
        frequency,
        prompt,
      );
      if (success) {
        setIsRunning(true);
      }
    }
  };

  const stop = async () => {
    await stopBot();
    setIsRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg text-center font-bold">Control Panel</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Separator className="mb-6" />
        <div className="flex flex-col sm:flex-row sm:justify-center gap-4 px-4 lg:px-8 xl:px-16">
          <Button
            variant="outline"
            disabled={!isConnected || isRunning}
            onClick={start}
          >
            <IconPlus />
            {isRunning ? "Running" : "Run Bot"}
          </Button>
          <Button disabled={!isConnected || !isRunning} onClick={stop}>
            <IconStop />
            {isRunning ? "Stop Bot" : "Stopped"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
