"use client";
import { Button } from "@/components/ui/button";
import { Settings } from "@/components/settings";
import HealthStatus from "@/components/screenpipe-status";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Heart,
  Bell,
  Play,
  Folder,
  Book,
  User,
  Fingerprint,
  Settings2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import {
  InboxMessageAction,
  InboxMessages,
  Message,
} from "@/components/inbox-messages";
import { useState, useEffect } from "react";
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
import { Calendar } from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export default function Header() {
  const [showInbox, setShowInbox] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const { health } = useHealthCheck();
  const { settings } = useSettings();
  const { user } = useUser();

  // const isLoading = !health;
  const isLoading = false; // ! testing - had issue with this before

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

    const unlisten = listen<{
      title: string;
      body: string;
      actions?: InboxMessageAction[];
    }>("inbox-message-received", async (event) => {
      console.log("inbox-message-received", event);
      const newMessage: Message = {
        id: Date.now().toString(),
        title: event.payload.title,
        body: event.payload.body,
        date: new Date().toISOString(),
        read: false,
        actions: event.payload.actions,
      };
      setMessages((prevMessages) => {
        const updatedMessages = [newMessage, ...prevMessages];
        localforage.setItem("inboxMessages", updatedMessages);
        return updatedMessages;
      });
    });

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

  const handleClearAll = async () => {
    setMessages([]);
    await localforage.setItem("inboxMessages", []);
  };

  const { setShowOnboarding } = useOnboarding();
  const { setShowChangelogDialog } = useChangelogDialog();

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

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowInbox(!showInbox)}
              className="cursor-pointer h-8 w-8 p-0"
            >
              <Bell className="h-4 w-4" />
              <span className="sr-only">notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer h-8 w-8 p-0"
                >
                  <User className="h-4 w-4" />
                  <span className="sr-only">user menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mr-4" align="end">
                <DropdownMenuLabel>account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <Dialog>
                    <DialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer  p-1.5"
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent
                      className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-hidden p-0 [&>button]:hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Settings />
                    </DialogContent>
                  </Dialog>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => open("https://docs.screenpi.pe")}
                  >
                    <Book className="mr-2 h-4 w-4" />
                    <span>check docs</span>
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
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
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
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {showInbox && (
            <div className="absolute right-4 top-16 z-50 bg-white shadow-lg rounded-lg">
              <InboxMessages
                messages={messages}
                onMessageRead={handleMessageRead}
                onMessageDelete={handleMessageDelete}
                onClearAll={handleClearAll}
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
