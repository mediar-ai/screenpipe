"use client";

import { ChatList } from "@/components/chat-list-openai-v2";
import { Settings } from "@/components/settings";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import React, { useEffect } from "react";
import NotificationHandler from "@/components/notification-handler";
import ScreenpipeInstanceChecker from "@/components/screenpipe-instance-checker";
import Header from "@/components/header";
import { checkForAppUpdates } from "@/components/updater";
import UpdateNotification from "@/components/update-notification";

export default function Home() {
  const { settings } = useSettings();
  // console.log("settings", settings);

  useEffect(() => {
    checkForAppUpdates();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <NotificationHandler />
      {/* <UpdateNotification checkIntervalHours={3} /> */}
      {/* <ScreenpipeInstanceChecker /> */}
      <Header />
      {settings.isLoading ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <Skeleton className="w-[200px] h-[24px] rounded-full" />
          <Skeleton className="w-[300px] h-[20px] rounded-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            {[...Array(5)].map((_, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <Skeleton className="w-full h-[40px]" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : settings.useOllama || settings.openaiApiKey ? (
        <ChatList
          apiKey={settings.openaiApiKey}
          useOllama={settings.useOllama}
          ollamaUrl={settings.ollamaUrl}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-[calc(60vh-200px)]">
          <Card className="w-[350px]">
            <CardHeader>
              <CardTitle>Welcome to Screenpipe playground</CardTitle>
              <CardDescription>
                Make sure to run screenpipe CLI first (check status above).
                Also, please, set your AI provider settings to ask questions
                about your data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Settings />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
