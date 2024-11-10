"use client";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchChat } from "@/components/search-chat";
import { Separator } from "@/components/ui/separator";
import Onboarding from "@/components/onboarding";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { registerShortcuts } from "@/lib/shortcuts";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSearchHistory } from "@/lib/hooks/use-search-history";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { platform } from "@tauri-apps/plugin-os";

export default function Home() {
  const { settings } = useSettings();
  const posthog = usePostHog();
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding } = useOnboarding();

  const {
    searches,
    currentSearchId,
    setCurrentSearchId,
    addSearch,
    deleteSearch,
    isCollapsed,
    toggleCollapse,
  } = useSearchHistory();

  useEffect(() => {
    registerShortcuts({
      showScreenpipeShortcut: settings.showScreenpipeShortcut,
    });
  }, [settings.showScreenpipeShortcut]);

  useEffect(() => {
    if (settings.userId) {
      posthog?.identify(settings.userId, {
        os: platform(),
      });
    }
  }, [settings.userId, posthog]);

  const handleNewSearch = () => {
    setCurrentSearchId(null);
    location.reload();
    // Add any other reset logic you need
  };

  return (
    // <SidebarProvider defaultOpen={false}>
    //   {settings.aiUrl && (
    //     <AppSidebar
    //       searches={searches}
    //       currentSearchId={currentSearchId}
    //       onSelectSearch={setCurrentSearchId}
    //       onDeleteSearch={deleteSearch}
    //     />
    //   )}
    //   <SidebarInset>
    <div className="flex flex-col items-center flex-1">
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        {/* <SidebarTrigger className="h-8 w-8" /> */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewSearch}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <NotificationHandler />
      {showOnboarding && <Onboarding />}
      <ChangelogDialog />
      <Header />
      <div className="my-4" />
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
      ) : settings.aiUrl ? (
        <>
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-center mb-2 flex items-center justify-center gap-3">
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black text-white text-sm">
                  1
                </span>
                search for a keyword
              </span>
              <span className="text-gray-400">→</span>
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black text-white text-sm">
                  2
                </span>
                filter results
              </span>
              <span className="text-gray-400">→</span>
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black text-white text-sm">
                  3
                </span>
                ask AI a question
              </span>
            </h1>
            <p className="text-xl text-muted-foreground -mt-0">
              where pixels become magic
            </p>
          </div>
          <SearchChat
            currentSearchId={currentSearchId}
            onAddSearch={addSearch}
            searches={searches}
          />
        </>
      ) : (
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
    </div>
    //   </SidebarInset>
    // </SidebarProvider>
  );
}
