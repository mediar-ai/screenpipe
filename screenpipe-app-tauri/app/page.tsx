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

import React, { useEffect, useState } from "react";
import NotificationHandler from "@/components/notification-handler";
import ScreenpipeInstanceChecker from "@/components/screenpipe-instance-checker";
import Header from "@/components/header";
import { checkForAppUpdates } from "@/components/updater";
import UpdateNotification from "@/components/update-notification";
import { usePostHog } from "posthog-js/react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { DevSettings } from "@/components/dev-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchChat } from "@/components/search-chat";

export default function Home() {
  const { settings } = useSettings();
  const posthog = usePostHog();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("search");

  useEffect(() => {
    checkForAppUpdates({ toast });
  }, [toast]);

  useEffect(() => {
    if (settings.userId) {
      posthog?.identify(settings.userId);
    }
  }, [settings.userId, posthog]);

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
        <>
          <h1 className="text-2xl font-bold mb-8 text-center mb-12">
            where pixels become magic
          </h1>
          <SearchChat />
        </>
      ) : (
        // <Tabs
        //   value={activeTab}
        //   onValueChange={setActiveTab}
        //   className="w-full max-w-4xl"
        // >
        //   <TabsList className="grid w-full grid-cols-2">
        //     <TabsTrigger value="chat">chat</TabsTrigger>
        //     <TabsTrigger value="search">search</TabsTrigger>
        //   </TabsList>
        //   <TabsContent value="chat">
        //     <ChatList
        //       apiKey={settings.openaiApiKey}
        //       useOllama={settings.useOllama}
        //       ollamaUrl={settings.ollamaUrl}
        //     />
        //   </TabsContent>
        //   <TabsContent value="search">
        //     <SearchPanel />
        //   </TabsContent>
        // </Tabs>
        <div className="flex flex-col items-center justify-center h-[calc(80vh-200px)]">
          <Card className="w-[600px]">
            <CardHeader>
              <CardTitle>Welcome to Screenpipe playground</CardTitle>
              <CardDescription>
                Make sure to set your AI provider settings to ask questions
                about your data.
                <br />
                <br />
                <div className="aspect-w-16 aspect-h-9">
                  <iframe
                    src="https://www.youtube.com/embed/u2GfjvEY6tk"
                    title="Onboarding Video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-[300px] rounded-lg shadow-lg"
                  ></iframe>
                </div>
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
