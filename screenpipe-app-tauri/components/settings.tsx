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
} from "lucide-react";
import { DialogHeader, DialogTitle } from "./ui/dialog";
import { cn } from "@/lib/utils";
import { RecordingSettings } from "./recording-settings";
import { AccountSection } from "./settings/account-section";
import ShortcutSection from "./settings/shortcut-section";
import AISection from "./settings/ai-section";
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

type SettingsSection = "ai" | "shortcuts" | "recording" | "account";

export function Settings() {
  // const { settings, switchProfile, deleteProfile } = useSettings();
  const {
    profiles,
    activeProfile,
    createProfile,
    deleteProfile,
    setActiveProfile,
  } = useProfiles();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("account");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const { settings } = useSettings();

  const handleProfileChange = async () => {
    toast({
      title: "Restarting Screenpipe",
      description: "Please wait while we restart Screenpipe",
    });
    await invoke("kill_all_sreenpipes");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await invoke("spawn_screenpipe");

    await new Promise((resolve) => setTimeout(resolve, 1000));
    relaunch();
  };

  const handleCreateProfile = async () => {
    if (newProfileName.trim() === "default") {
      toast({
        title: "profile name is not allowed",
        description: "Please choose a different name for your profile",
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

  useEffect(() => {
    console.log(profiles, "profiles");
  }, [profiles]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-[#f3f3f3]">
        <DialogHeader className="flex items-center gap-4 ml-6 mt-4">
          <DialogTitle className="text-2xl font-bold">settings</DialogTitle>
        </DialogHeader>

        {/* Profile Selector */}
        <div className="px-4 py-3 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between font-mono text-sm"
              >
                {activeProfile}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {profiles?.map((profile) => (
                <DropdownMenuItem
                  key={profile}
                  className="justify-between"
                  onSelect={() => handleSwitchProfile(profile)}
                >
                  <span className="font-mono">{profile}</span>
                  {activeProfile === profile && <Check className="h-4 w-4" />}
                  {profile !== "default" && (
                    <Trash2
                      className="h-4 w-4 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProfile(profile);
                      }}
                    />
                  )}
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
                      placeholder="profile name"
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
                  <span>new profile</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Existing Settings Navigation */}
        <div className="flex flex-col space-y-1 p-4">
          {[
            {
              id: "account",
              label: "account",
              icon: <User className="h-4 w-4" />,
            },
            {
              id: "ai",
              label: "ai settings",
              icon: <Brain className="h-4 w-4" />,
            },
            {
              id: "recording",
              label: "recording",
              icon: <Video className="h-4 w-4" />,
            },
            {
              id: "shortcuts",
              label: "shortcuts",
              icon: <Keyboard className="h-4 w-4" />,
            },
          ].map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as SettingsSection)}
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

      {/* Content */}
      <div className="flex-1 flex flex-col h-full max-h-[80vh]">
        <div className="flex-1 overflow-y-auto px-4">
          <div className="max-h-full">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
