"use client";

import React, { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Brain,
  Video,
  Keyboard,
  User,
  ChevronDown,
  Plus,
  Trash2,
  Check,
  Settings as SettingsIcon,
  X,
  HardDrive,
} from "lucide-react";
import { DialogHeader, DialogTitle } from "./ui/dialog";
import { cn } from "@/lib/utils";
import { AccountSection } from "./settings/account-section";
import ShortcutSection from "./settings/shortcut-section";
import AISection from "./settings/ai-section";
import { AIPresets } from "./settings/ai-presets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { toast } from "./ui/use-toast";
import { Dialog, DialogContent } from "./ui/dialog";
import { useSettingsDialog } from "@/lib/hooks/use-settings-dialog";
import { RecordingSettings } from "./settings/recording-settings";
import GeneralSettings from "./settings/general-settings";
import { DiskUsageSection } from "./settings/disk-usage-section";

type SettingsSection =
  | "general"
  | "ai"
  | "shortcuts"
  | "recording"
  | "account"
  | "disk-usage";

export function Settings() {
  const { isOpen, setIsOpen: setSettingsOpen } = useSettingsDialog();
  const {
    profiles,
    activeProfile,
    createProfile,
    deleteProfile,
    setActiveProfile,
  } = useProfiles();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const { settings } = useSettings();

  const handleProfileChange = async () => {
    toast({
      title: "Restarting Screenpipe",
      description: "Please wait while we restart Screenpipe",
    });
    await invoke("stop_screenpipe");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await invoke("spawn_screenpipe");

    await new Promise((resolve) => setTimeout(resolve, 1000));
    relaunch();
  };

  const handleCreateProfile = async () => {
    if (newProfileName.trim() === "default") {
      toast({
        title: "Profile name not allowed",
        description: "Please choose a different name for your profile",
        variant: "destructive",
      });
      return;
    }
    if (newProfileName.trim()) {
      console.log("creating profile", newProfileName.trim());
      createProfile({
        profileName: newProfileName.trim(),
        currentSettings: settings,
      });
      setActiveProfile(newProfileName.trim());
      setNewProfileName("");
      setIsCreatingProfile(false);
      handleProfileChange();
    }
  };

  const handleSwitchProfile = async (profileName: string) => {
    setActiveProfile(profileName);
    handleProfileChange();
  };

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
  ];

  useEffect(() => {
    console.log(profiles, "profiles");
  }, [profiles]);

  return (
    <Dialog modal={true} open={isOpen} onOpenChange={setSettingsOpen}>
      <DialogContent
        className="max-w-7xl w-full max-h-[90vh] h-[90vh] overflow-hidden p-0 border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full min-h-0">
          {/* Sidebar */}
          <div className="w-80 border-r bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col min-h-0">
            <div className="p-6 border-b">
              <DialogHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Settings
                  </DialogTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSettingsOpen(false)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Profile Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Profile
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-mono text-sm bg-white dark:bg-slate-800"
                      >
                        {activeProfile}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72">
                      {profiles?.map((profile) => (
                        <DropdownMenuItem
                          key={profile}
                          className="justify-between"
                          onSelect={() => handleSwitchProfile(profile)}
                        >
                          <span className="font-mono">{profile}</span>
                          <div className="flex items-center gap-2">
                            {activeProfile === profile && (
                              <Check className="h-4 w-4 text-green-600" />
                            )}
                            {profile !== "default" && (
                              <Trash2
                                className="h-4 w-4 opacity-50 hover:opacity-100 text-red-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteProfile(profile);
                                }}
                              />
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      {isCreatingProfile ? (
                        <div className="p-2">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleCreateProfile();
                            }}
                            className="flex gap-2"
                          >
                            <Input
                              value={newProfileName}
                              onChange={(e) => setNewProfileName(e.target.value)}
                              placeholder="Profile name"
                              className="h-8 font-mono"
                              autoFocus
                            />
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!newProfileName.trim()}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setIsCreatingProfile(true);
                          }}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          <span>New profile</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </DialogHeader>
            </div>

            {/* Navigation */}
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() =>
                    setActiveSection(section.id as SettingsSection)
                  }
                  className={cn(
                    "w-full flex items-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group",
                    activeSection === section.id
                      ? "bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      : "hover:bg-white/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100",
                  )}
                >
                  <div className={cn(
                    "mt-0.5 transition-colors",
                    activeSection === section.id
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                  )}>
                    {section.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{section.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {section.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                OpenRewind Settings
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 min-h-0">
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              <div className="p-8 pb-16 max-w-4xl mx-auto">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
