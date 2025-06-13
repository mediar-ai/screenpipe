"use client";
import { Button } from "@/components/ui/button";
import HealthStatus from "@/components/screenpipe-status";
import { ThemeToggle } from "@/components/theme-toggle";

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
  Settings2,
  Upload,
  Mail,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import {
  InboxMessageAction,
  InboxMessages,
  Message,
} from "@/components/inbox-messages";
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import localforage from "localforage";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ShareLogsButton } from "./share-logs-button";
import { openSettingsWindow } from "@/lib/utils/window";
import { commands } from "@/lib/utils/tauri";

export default function Header() {
  const [showInbox, setShowInbox] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const loadMessages = async () => {
      const savedMessages =
        await localforage.getItem<Message[]>("inboxMessages");
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

  const { setShowChangelogDialog } = useChangelogDialog();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleShowOnboarding = async () => {
    try {
      await commands.showWindow("Onboarding");
    } catch (error) {
      console.error("Failed to show onboarding window:", error);
    }
  };

  return (
    <div>
      <div className="relative z-[-1] flex flex-col items-center">
        <div className="relative flex flex-col items-center before:absolute before:h-[300px] before:w-full before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-background before:to-transparent before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full after:translate-x-1/3 after:bg-gradient-conic after:from-primary/20 after:via-primary/30 after:content-[''] sm:before:w-[480px] sm:after:w-[240px] before:lg:h-[360px] gap-4">
          <div className="w-[180px] h-[50px]" />
        </div>
      </div>
      <div className="flex items-center space-x-2 absolute top-4 right-4">
        <Popover open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="bg-card hover:bg-card-hover">
              <Mail className="h-3.5 w-3.5 mr-2" />
              feedback
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-100 rounded-2xl bg-card border-border">
            <ShareLogsButton showShareLink={false} onComplete={() => setIsFeedbackOpen(false)} />
          </PopoverContent>
        </Popover>
        
        <ThemeToggle className="bg-card hover:bg-card-hover" />
        
        <HealthStatus className="cursor-pointer" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer h-8 w-8 p-0 bg-card hover:bg-card-hover"
            >
              <User className="h-4 w-4" />
              <span className="sr-only">user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="mr-4 bg-card border-border" align="end">
            <DropdownMenuLabel className="text-text-primary">account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={async (e) => {
                  e.preventDefault();
                  await openSettingsWindow();
                }}
                className="cursor-pointer p-1.5 hover:bg-accent text-text-primary"
              >
                <Settings2 className="mr-2 h-4 w-4" />
                <span>settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent text-text-primary"
                onClick={() => open("https://docs.screenpi.pe")}
              >
                <Book className="mr-2 h-4 w-4" />
                <span>check docs</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent text-text-primary"
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
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent text-text-primary"
                onClick={() => handleShowOnboarding()}
              >
                <Play className="mr-2 h-4 w-4" />
                <span>show onboarding</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent text-text-primary"
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
        <div className="absolute right-4 top-16 z-50 bg-card shadow-lg rounded-lg border border-border">
          <InboxMessages
            messages={messages}
            onMessageRead={handleMessageRead}
            onMessageDelete={handleMessageDelete}
            onClearAll={handleClearAll}
            onClose={() => setShowInbox(false)}
          />
        </div>
      )}
    </div>
  );
}
