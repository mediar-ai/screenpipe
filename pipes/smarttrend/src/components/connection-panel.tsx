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
import * as store from "@/lib/store";
import { signInToTwitter } from "@/lib/actions/twitter-sign-in";
import type { CookieParam } from "puppeteer-core";

interface Props {
  setCookies: (cookies: CookieParam[]) => void;
  isConnected: boolean;
}

export function ConnectionPanel({ setCookies, isConnected }: Props) {
  const connect = async () => {
    try {
      const cookies = await signInToTwitter();
      setCookies(cookies);
      store.putCookies(cookies);
    } catch (e) {
      console.error(e);
    }
  };

  const disconnect = async () => {
    setCookies([]);
    store.putCookies([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-center font-bold">
          Authenticate Twitter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Separator className="mb-6" />
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
      </CardContent>
    </Card>
  );
}
