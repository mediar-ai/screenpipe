"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  IconDownload,
  IconUser,
  IconRefresh,
  IconClose,
} from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { installBrowser } from "@/lib/actions/install-browser";
import { signInToTwitter } from "@/lib/actions/twitter-sign-in";
import type { CookieParam } from "puppeteer-core";

interface Props {
  executablePath: string;
  setExecutablePath: (executablePath: string) => void;
  setCookies: (cookies: CookieParam[]) => void;
  isConnected: boolean;
}

export function ConnectionPanel({
  executablePath,
  setExecutablePath,
  setCookies,
  isConnected,
}: Props) {
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  const install = async () => {
    setIsInstalling(true);
    try {
      const path = await installBrowser();
      setExecutablePath(path);
    } catch (e) {
      console.error(e);
    }
    setIsInstalling(false);
  };

  const connect = async () => {
    try {
      const newCookies = await signInToTwitter(executablePath);
      setCookies(newCookies);
    } catch (e) {
      console.error(e);
    }
  };

  const disconnect = async () => {
    setCookies([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-center font-bold">
          {executablePath === null ? "Install Chrome" : "Authenticate Twitter"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Separator className="mb-6" />
        {executablePath === null ? (
          <div className="flex sm:justify-center lg:px-8 xl:px-16">
            <Button variant="outline" onClick={install}>
              {isInstalling ? <IconRefresh /> : <IconDownload />}
              {isInstalling ? "Installing..." : "Install"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:justify-center gap-4 lg:px-8 xl:px-16">
            <Button variant="outline" onClick={connect}>
              {isConnected ? <IconRefresh /> : <IconUser />}
              {isConnected ? "Reconnect" : "Connect"}
            </Button>
            <Button disabled={!isConnected} onClick={disconnect}>
              <IconClose />
              {isConnected ? "Disconnect" : "Disconnected"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
