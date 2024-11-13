"use client";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Settings } from "@/components/settings";
import { PrettyLink } from "@/components/pretty-link";
import HealthStatus from "@/components/screenpipe-status";

import React from "react";
import PipeDialog from "@/components/pipe-store";
import MeetingHistory from "@/components/meeting-history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, Heart, Menu, Bell, Play, Folder } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { InboxMessages, Message } from "@/components/inbox-messages";
import { useState, useRef, useEffect } from "react";
import Onboarding from "@/components/onboarding";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { listen } from "@tauri-apps/api/event";
import localforage from "localforage";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { Skeleton } from "@/components/ui/skeleton";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { useSettings } from "@/lib/hooks/use-settings";
import { invoke } from "@tauri-apps/api/core";
import { Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Header() {
  const [showInbox, setShowInbox] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const { health } = useHealthCheck();
  const { settings } = useSettings();

  const isLoading = !health;

  useEffect(() => {
    const loadMessages = async () => {
      const savedMessages = await localforage.getItem<Message[]>(
        "inboxMessages"
      );
      if (savedMessages) {
        setMessages(savedMessages);
      }
    };

    loadMessages();

    const unlisten = listen<Message>(
      "inbox-message-received",
      async (event) => {
        console.log("inbox-message-received", event);
        const newMessage: Message = {
          id: Date.now().toString(),
          title: event.payload.title,
          body: event.payload.body,
          date: new Date().toISOString(),
          read: false,
        };
        setMessages((prevMessages) => {
          const updatedMessages = [newMessage, ...prevMessages];
          localforage.setItem("inboxMessages", updatedMessages);
          return updatedMessages;
        });
      }
    );

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, []);

  const handleMessageRead = async (id: string) => {
    setMessages((prevMessages) => {
      const updatedMessages = prevMessages.map((msg) =>
        msg.id === id ? { ...msg, read: true } : msg
      );
      localforage.setItem("inboxMessages", updatedMessages);
      return updatedMessages;
    });
  };

  const handleMessageDelete = async (id: string) => {
    setMessages((prevMessages) => {
      const updatedMessages = prevMessages.filter((msg) => msg.id !== id);
      localforage.setItem("inboxMessages", updatedMessages);
      return updatedMessages;
    });
  };

  const { setShowOnboarding } = useOnboarding();
  const { setShowChangelogDialog } = useChangelogDialog();

  const handleShowTimeline = async () => {
    await invoke("show_timeline");
  };

  return (
    <div>
      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <>
          <div className="relative z-[-1] flex flex-col items-center">
            <div className="relative flex flex-col items-center before:absolute before:h-[300px] before:w-full before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 sm:before:w-[480px] sm:after:w-[240px] before:lg:h-[360px] gap-4">
              <div className="w-[180px] h-[50px]" />
            </div>
          </div>
          <div className="flex space-x-4 absolute top-4 right-4">
            <HealthStatus className="mt-3 cursor-pointer" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={handleShowTimeline}
                      disabled={
                        !settings.enableFrameCache ||
                        !health ||
                        health.status === "error"
                      }
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      timeline
                    </Button>
                  </div>
                </TooltipTrigger>
                {!settings.enableFrameCache && (
                  <TooltipContent>
                    <p>enable timeline in settings first</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <MeetingHistory />
            <Settings />

            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              onClick={() => setShowInbox(!showInbox)}
            >
              <Bell className="h-[1.2rem] w-[1.2rem]" />
              <span className="sr-only">notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="cursor-pointer">
                  <Menu className="h-[1.2rem] w-[1.2rem]" />
                  <span className="sr-only">menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mr-4" align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={(e) => e.preventDefault()}
                >
                  <PipeDialog />
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() =>
                    open(
                      "mailto:louis@screenpi.pe?subject=Screenpipe%20Feedback&body=Please%20enter%20your%20feedback%20here...%0A%0A...%20or%20let's%20chat?%0Ahttps://cal.com/louis030195/screenpipe"
                    )
                  }
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span>send feedback</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() =>
                    open(
                      "https://twitter.com/intent/tweet?text=here's%20how%20i%20use%20@screen_pipe%20...%20%5Bscreenshot%5D%20an%20awesome%20tool%20for%20..."
                    )
                  }
                >
                  <Heart className="mr-2 h-4 w-4" />
                  <span>support us</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setShowOnboarding(true)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  <span>show onboarding</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setShowChangelogDialog(true)}
                >
                  <Folder className="mr-2 h-4 w-4" />
                  <span>show changelog</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {showInbox && (
            <div className="absolute right-4 top-16 z-50 bg-white shadow-lg rounded-lg">
              <InboxMessages
                messages={messages}
                onMessageRead={handleMessageRead}
                onMessageDelete={handleMessageDelete}
                onClose={() => setShowInbox(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="w-full">
      <div className="flex justify-center">
        <Skeleton className="w-[180px] h-[50px] mt-4" />
      </div>
      <div className="flex space-x-4 absolute top-4 right-4">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    </div>
  );
}
