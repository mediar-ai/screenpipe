"use client";

import React, { useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Settings2, Brain, Video, Keyboard, User, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { cn } from "@/lib/utils";
import { RecordingSettings } from "./recording-settings";
import { AccountSection } from "./settings/account-section";
import ShortcutSection from "./settings/shortcut-section";
import AISection from "./settings/ai-section";

type SettingsSection = "ai" | "shortcuts" | "recording" | "account";

export function Settings({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("ai");

  const renderSection = () => {
    switch (activeSection) {
      case "ai":
        return <AISection />;
      case "account":
        return <AccountSection />;
      case "recording":
        return <RecordingSettings />;
      case "shortcuts":
        return <ShortcutSection />;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <div
          className={cn(
            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            className
          )}
          onSelect={(e) => e.preventDefault()}
        >
          <div className="flex items-center">
            <Settings2 className="mr-2 h-4 w-4" />
            <span>settings</span>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent  className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-hidden p-0 [&>button]:hidden">
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 border-r bg-[#f3f3f3]">
            <div className="flex items-center gap-4 ml-6 mt-4">
              <h1 className="text-2xl font-bold">Settings</h1>
            </div>
            <div className="flex flex-col space-y-1 p-4">
              {[
                {
                  id: "account",
                  label: "Account",
                  icon: <User className="h-4 w-4" />,
                },
                {
                  id: "ai",
                  label: "AI Settings",
                  icon: <Brain className="h-4 w-4" />,
                },
                {
                  id: "recording",
                  label: "Recording",
                  icon: <Video className="h-4 w-4" />,
                },
                {
                  id: "shortcuts",
                  label: "Shortcuts",
                  icon: <Keyboard className="h-4 w-4" />,
                },
              ].map((section) => (
                  <button
                    key={section.id}
                    onClick={() =>
                      setActiveSection(section.id as SettingsSection)
                    }
                    className={cn(
                      "flex items-center space-x-2 px-4 py-1.5 rounded-lg transition-colors",
                      activeSection === section.id
                        ? "bg-black/90 text-white"
                        : "hover:bg-black/10"
                    )}
                  >
                    {section.icon}
                    <span>{section.label}</span>
                  </button>
              ))}
            </div>
          </div>

          {/* Content - Updated styles */}
          <div className="flex-1 flex flex-col h-full max-h-[80vh]">
            <div className="flex-1 overflow-y-auto px-4">
              <div className="max-h-full">{renderSection()}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
