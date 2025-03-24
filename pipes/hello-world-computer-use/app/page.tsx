"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { Loader2, FolderOpen, SparklesIcon } from "lucide-react";
import { useSettings } from "@/lib/settings-provider";
import {
  AIPresetsSelector,
  AIProviderConfig,
} from "@/components/ai-presets-selector";
import {
  AIPresetsDialog,
  DEFAULT_PROMPT,
} from "@/components/ai-presets-dialog";
import { Command, CommandList } from "@/components/ui/command";

export default function LinkedInToCrmSync() {
  const [csvStoragePath, setCsvStoragePath] = useState("");
  const [syncSchedule, setSyncSchedule] = useState("manual"); // manual, daily, hourly
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pathValidation, setPathValidation] = useState<{
    isValid: boolean;
    message: string;
  }>({
    isValid: false,
    message: "",
  });
  const { settings, updateSettings } = useSettings();
  console.log("settings", settings);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedPath = settings?.customSettings?.desktopToTable?.csvStoragePath;
    if (savedPath) setCsvStoragePath(savedPath);

    const savedSyncSchedule =
      settings?.customSettings?.desktopToTable?.syncSchedule;
    if (savedSyncSchedule) setSyncSchedule(savedSyncSchedule);

    const savedLastSync =
      settings?.customSettings?.desktopToTable?.lastSyncTime;
    if (savedLastSync) setLastSyncTime(savedLastSync);
  }, [settings]);

  // Function to extract LinkedIn messages and save to CSV
  const extractAndSyncMessages = async () => {
    try {
      setIsLoading(true);
      toast({
        title: "starting linkedin message extraction",
        description: "please keep linkedin messaging open in a browser window",
      });

      // Open LinkedIn messaging in another tab
      window.open("https://www.linkedin.com/messaging", "_blank");

      // Wait for the page to be fully loaded
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Save storage path and settings
      await updateSettings({
        customSettings: {
          desktopToTable: {
            csvStoragePath,
            syncSchedule,
            lastSyncTime,
          },
        },
      });

      const response = await fetch("/api/log");
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setLastSyncTime(new Date().toISOString());

      toast({
        title: "linkedin messages saved to csv",
        description: `successfully saved ${data.messages.length} messages to ${csvStoragePath}`,
      });
    } catch (error) {
      console.error("error extracting and saving linkedin messages:", error);
      toast({
        title: "sync failed",
        description: "an error occurred while saving messages to csv",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to select CSV storage directory
  const openPath = async () => {
    try {
      // Check if File System Access API is supported
      if (!("showDirectoryPicker" in window)) {
        toast({
          variant: "destructive",
          title: "error",
          description:
            "your browser doesn't support directory selection. please enter the path manually or try a different browser.",
        });
        return;
      }

      // Open directory picker dialog
      const dirHandle = await (window as any).showDirectoryPicker();

      // Request permission to access the directory
      if (dirHandle.requestPermission) {
        const permission = await dirHandle.requestPermission({
          mode: "readwrite",
        });
        if (permission !== "granted") {
          throw new Error("Permission to access the directory was denied");
        }
      }

      // For Tauri apps, get the full system path
      let fullPath = "";

      try {
        // If running in Tauri, use the native dialog
        // @ts-ignore - Tauri API
        if (window.__TAURI__) {
          // @ts-ignore - Tauri API
          fullPath = await window.__TAURI__.dialog.open({
            directory: true,
            multiple: false,
            title: "Select CSV Storage Directory",
          });
        } else {
          // For web browsers, try to get a more detailed path
          // This is limited by browser security, so we need to handle this case
          fullPath = dirHandle.name;

          // Try to use File System API to get full path if possible
          if ((dirHandle as any).getSystemDirectory) {
            fullPath = await (dirHandle as any).getSystemDirectory();
          }

          // If we just have a name, we'll warn the user
          if (fullPath.indexOf("/") === -1 && fullPath.indexOf("\\") === -1) {
            toast({
              title: "limited path information",
              description:
                "browser security limits access to full path. you may need to enter the full path manually.",
            });
          }
        }
      } catch (err) {
        console.warn("failed to get full path:", err);
        // Fallback to just the directory name
        fullPath = dirHandle.name;
      }

      setCsvStoragePath(fullPath);
      setPathValidation({
        isValid: true,
        message: "path selected: " + fullPath,
      });

      await updateSettings({
        customSettings: {
          desktopToTable: {
            csvStoragePath: fullPath,
            syncSchedule,
            lastSyncTime,
          },
        },
      });

      toast({
        title: "storage path updated",
        description: "csv storage path has been set",
      });
    } catch (err) {
      console.warn("failed to open directory picker:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to select directory",
      });
    }
  };

  // Add this function to validate a manually entered path
  const validatePath = async (path: string) => {
    if (!path.trim()) {
      setPathValidation({
        isValid: false,
        message: "",
      });
      return;
    }

    try {
      // In a browser context, we can't really validate the path
      // In Tauri, we could check if the directory exists
      // @ts-ignore - Tauri API
      if (window.__TAURI__) {
        // @ts-ignore - Tauri API
        const exists = await window.__TAURI__.fs.exists(path);
        if (!exists) {
          setPathValidation({
            isValid: false,
            message: "directory does not exist",
          });
          return;
        }
      }

      setPathValidation({
        isValid: true,
        message: "path accepted",
      });
    } catch (error) {
      console.error("Error validating path:", error);
      setPathValidation({
        isValid: false,
        message: "invalid path",
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
      <header className="w-full max-w-2xl text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">linkedin to csv sync</h1>
        <p className="text-gray-600 dark:text-gray-400">
          save your linkedin conversations to csv files
        </p>
      </header>

      <Card className="w-full max-w-2xl p-6 shadow-md">
        {/* Storage Location Setup */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">storage location</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                csv storage location
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="path to save csv files"
                  value={csvStoragePath}
                  onChange={(e) => {
                    setCsvStoragePath(e.target.value);
                    validatePath(e.target.value);
                  }}
                  className={`w-full ${
                    pathValidation.isValid
                      ? "border-green-500"
                      : pathValidation.message
                      ? "border-red-500"
                      : ""
                  }`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={openPath}
                  className="px-3"
                  title="select directory"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                where to save linkedin message csv files
              </p>
              {pathValidation.message && (
                <p
                  className={`text-sm ${
                    pathValidation.isValid ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {pathValidation.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* AI model selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">ai model</h2>
          <div className="space-y-4">
            <Command>
              <CommandList>
                <AIPresetsDialog
                  pipeName={"desktop-to-table"}
                  recommendedPresets={[
                    {
                      id: "gemma",
                      model: "gemma:2b",
                      provider: "native-ollama",
                      prompt: DEFAULT_PROMPT,
                      maxContextChars: 512000,
                    },
                  ]}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className=" p-2"
                  >
                    <SparklesIcon className="h-4 w-4" />
                  </Button>
                </AIPresetsDialog>
                <AIPresetsSelector pipeName="desktop-to-table" />
              </CommandList>
            </Command>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">sync</h2>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={extractAndSyncMessages}
                disabled={isLoading || !csvStoragePath}
                className="flex-1"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                sync now
              </Button>
            </div>

            {/* Sync Schedule Options */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                sync schedule
              </label>
              <div className="flex gap-2">
                <Button
                  variant={syncSchedule === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncSchedule("manual")}
                  className="flex-1"
                >
                  manual
                </Button>
                <Button
                  variant={syncSchedule === "daily" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncSchedule("daily")}
                  className="flex-1"
                >
                  daily
                </Button>
                <Button
                  variant={syncSchedule === "hourly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncSchedule("hourly")}
                  className="flex-1"
                >
                  hourly
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                note: scheduled sync requires keeping screenpipe running
              </p>
            </div>
          </div>

          {lastSyncTime && (
            <p className="text-xs text-gray-500 mt-2">
              last sync: {new Date(lastSyncTime).toLocaleString()}
            </p>
          )}
        </div>

        {/* Quick Start Guide */}
        <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
          <h2 className="text-sm font-semibold mb-2">quick start</h2>
          <ol className="text-xs space-y-2 list-decimal pl-4">
            <li>select a directory to store the csv files</li>
            <li>open linkedin in your browser and click "sync now"</li>
            <li>csv files will be saved with date-based filenames</li>
            <li>each sync creates a new csv file with timestamp</li>
          </ol>
        </div>
      </Card>

      <footer className="w-full max-w-2xl mt-6 text-center text-xs text-gray-500">
        <p>linkedin to csv sync by screenpipe</p>
        <p className="mt-1">
          questions?{" "}
          <a href="https://discord.gg/screenpipe" className="underline">
            join our discord
          </a>
        </p>
      </footer>
    </div>
  );
}
