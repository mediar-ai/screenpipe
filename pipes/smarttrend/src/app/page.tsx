"use client";

import { useState, useMemo, useEffect } from "react";
import { ConnectionPanel } from "@/components/connection-panel";
import { ControlPanel } from "@/components/control-panel";
import { Status } from "@/components/status";
import { SuggestionList } from "@/components/suggestion-list";
import * as store from "@/lib/store";
import type { CookieParam } from "puppeteer-core";

export default function Page() {
  const [cookies, setCookies] = useState<CookieParam[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const isConnected = useMemo(() => cookies.length > 0, [cookies]);

  useEffect(() => {
    store.getCookies().then(setCookies);
  }, []);

  return (
    <div className="flex flex-col lg:h-screen lg:overflow-y-hidden">
      <h1 className="my-12 text-2xl text-center font-bold">SmartTrend</h1>
      <div className="flex flex-col gap-8 lg:flex-row xl:gap-16 h-full px-8 lg:px-16">
        <div className="flex flex-col gap-8 h-full">
          <ConnectionPanel setCookies={setCookies} isConnected={isConnected} />
          <ControlPanel
            cookies={cookies}
            isConnected={isConnected}
            isRunning={isRunning}
            setIsRunning={setIsRunning}
          />
          <Status isRunning={isRunning} />
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
