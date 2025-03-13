"use client";

import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIProviderConfig } from "@/components/ai-presets-dialog";
import { ConnectionPanel } from "@/components/connection-panel";
import { ControlPanel } from "@/components/control-panel";
import { Status } from "@/components/status";
import { FrequencySlider } from "@/components/frequency-slider";
import { PromptInput } from "@/components/prompt-input";
import { SuggestionList } from "@/components/suggestion-list";
import { useToast } from "@/hooks/use-toast";
import * as store from "@/lib/store";
import type { Error } from "@/app/api/errors/route";
import type { CookieParam } from "puppeteer-core";

export default function Page() {
  const [cookies, setCookies] = useState<CookieParam[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [frequency, setFrequency] = useState<number>(5);
  const [prompt, setPrompt] = useState<string>("");
  const { toast } = useToast();

  const isConnected = useMemo(() => cookies.length > 0, [cookies]);

  useEffect(() => {
    store.getCookies().then(setCookies);
    store.getPrompt().then(setPrompt);

    const eventSource = new EventSource("/api/errors");

    eventSource.onmessage = (event) => {
      try {
        const e: Error = JSON.parse(event.data);
        toast({
          title: e.title,
          description: e.description,
          variant: "destructive",
        });
      } catch (e) {
        console.error("Failed to capture errors:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("Failed to capture errors:", e);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="flex flex-col lg:h-screen lg:overflow-y-hidden">
      <div className="my-12">
        <h1 className="text-2xl text-center font-bold">SmartTrend</h1>
      </div>
      <div className="flex flex-col gap-8 lg:flex-row xl:gap-16 h-full px-8 lg:px-16">
        <div>
          <Tabs defaultValue="tab1">
            <TabsList>
              <TabsTrigger value="tab1">App</TabsTrigger>
              <TabsTrigger value="tab2">Provider</TabsTrigger>
            </TabsList>
            <TabsContent className="flex flex-col gap-8 h-full" value="tab1">
              <ConnectionPanel
                setCookies={setCookies}
                isConnected={isConnected}
              />
              <ControlPanel
                cookies={cookies}
                isConnected={isConnected}
                isRunning={isRunning}
                setIsRunning={setIsRunning}
                frequency={frequency}
                prompt={prompt}
              />
              {isRunning && <Status />}
              {!isRunning && (
                <FrequencySlider
                  frequency={frequency}
                  setFrequency={setFrequency}
                />
              )}
              {!isRunning && (
                <PromptInput prompt={prompt} setPrompt={setPrompt} />
              )}
            </TabsContent>
            <TabsContent value="tab2">
              <AIProviderConfig onSubmit={() => {}} />
            </TabsContent>
          </Tabs>
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
