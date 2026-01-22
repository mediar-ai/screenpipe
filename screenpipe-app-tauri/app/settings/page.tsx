"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Brain,
  Video,
  Keyboard,
  User,
  Settings as SettingsIcon,
  HardDrive,
  Plug,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountSection } from "@/components/settings/account-section";
import ShortcutSection from "@/components/settings/shortcut-section";
import { AIPresets } from "@/components/settings/ai-presets";
import { RecordingSettings } from "@/components/settings/recording-settings";
import GeneralSettings from "@/components/settings/general-settings";
import { DiskUsageSection } from "@/components/settings/disk-usage-section";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { FeedbackSection } from "@/components/settings/feedback-section";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { listen } from "@tauri-apps/api/event";

type SettingsSection =
  | "general"
  | "ai"
  | "shortcuts"
  | "recording"
  | "account"
  | "disk-usage"
  | "connections"
  | "feedback";

function SettingsPageContent() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useQueryState("section", {
    defaultValue: "general" as SettingsSection,
    parse: (value) => {
      if (["general", "ai", "shortcuts", "recording", "account", "disk-usage", "connections", "feedback"].includes(value)) {
        return value as SettingsSection;
      }
      return "general" as SettingsSection;
    },
    serialize: (value) => value,
  });
  
  const { settings } = useSettings();

  const renderSection = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSettings />;
      case "ai":
        return <AIPresets />;
      case "account":
        return <AccountSection />;
      case "recording":
        return <RecordingSettings />;
      case "shortcuts":
        return <ShortcutSection />;
      case "disk-usage":
        return <DiskUsageSection />;
      case "connections":
        return <ConnectionsSection />;
      case "feedback":
        return <FeedbackSection />;
    }
  };

  const settingsSections = [
    {
      id: "general",
      label: "General",
      icon: <SettingsIcon className="h-4 w-4" />,
      description: "Basic app settings and preferences",
    },
    {
      id: "account",
      label: "Account",
      icon: <User className="h-4 w-4" />,
      description: "User account and authentication",
    },
    {
      id: "recording",
      label: "Recording",
      icon: <Video className="h-4 w-4" />,
      description: "Screen and audio recording settings",
    },
    {
      id: "ai",
      label: "AI Settings",
      icon: <Brain className="h-4 w-4" />,
      description: "AI models and processing options",
    },
    {
      id: "shortcuts",
      label: "Shortcuts",
      icon: <Keyboard className="h-4 w-4" />,
      description: "Keyboard shortcuts and hotkeys",
    },
    {
      id: "disk-usage",
      label: "Disk Usage",
      icon: <HardDrive className="h-4 w-4" />,
      description: "Monitor storage usage for Screenpipe data",
    },
    {
      id: "connections",
      label: "Connections",
      icon: <Plug className="h-4 w-4" />,
      description: "Connect to AI assistants like Claude",
    },
    {
      id: "feedback",
      label: "Send Feedback",
      icon: <MessageSquare className="h-4 w-4" />,
      description: "Report issues or share suggestions",
    },
  ];

  // Listen for navigation events from other windows
  useEffect(() => {
    const unlisten = listen<{ url: string }>("navigate", (event) => {
      const url = new URL(event.payload.url, window.location.origin);
      const section = url.searchParams.get("section");
      if (section && ["general", "ai", "shortcuts", "recording", "account", "disk-usage", "connections", "feedback"].includes(section)) {
        setActiveSection(section as SettingsSection);
      }
    });

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, [setActiveSection]);

  return (
    <div className="min-h-screen bg-background">
      {/* Transparent titlebar area */}
      <div className="h-8 bg-transparent" data-tauri-drag-region></div>
      
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-[calc(100vh-2rem)] min-h-0">
          {/* Sidebar */}
          <div className="w-80 border-r bg-background flex flex-col min-h-0 rounded-tl-lg">
            <div className="p-6 border-b">
              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              </div>
            </div>

            {/* Navigation */}
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id as SettingsSection)}
                  className={cn(
                    "w-full flex items-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group",
                    activeSection === section.id
                      ? "bg-card shadow-sm border border-border text-foreground"
                      : "hover:bg-card/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className={cn(
                    "mt-0.5 transition-colors",
                    activeSection === section.id
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {section.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{section.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {section.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-border flex-shrink-0">
              <div className="text-xs text-muted-foreground text-center">
                screenpipe Settings
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col h-full bg-background min-h-0 rounded-tr-lg">
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              <div className="p-8 pb-16 max-w-4xl mx-auto">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading settings...</div>
    </div>}>
      <SettingsPageContent />
    </Suspense>
  );
} 