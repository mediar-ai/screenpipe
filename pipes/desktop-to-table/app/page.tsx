"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { Loader2, FolderOpen } from "lucide-react";
import { useSettings } from "@/lib/settings-provider";
import { AIPresetsSelector } from "@/components/ai-presets-selector";

import { Command, CommandList } from "@/components/ui/command";
import { pipe } from "@screenpipe/browser";

export default function HelloWorldComputerUse() {
  const [app, setApp] = useState("cursor");
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

  const [tauri, setTauri] = useState<any>(undefined);

  useEffect(() => {
    // @ts-ignore - Tauri API
    setTauri(!!window.__TAURI__);
  }, []);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedApp = settings?.customSettings?.helloWorldComputerUse?.app;
    if (savedApp) setApp(savedApp);

    const savedPath =
      settings?.customSettings?.helloWorldComputerUse?.csvStoragePath;
    if (savedPath) setCsvStoragePath(savedPath);

    const savedSyncSchedule =
      settings?.customSettings?.helloWorldComputerUse?.syncSchedule;
    if (savedSyncSchedule) setSyncSchedule(savedSyncSchedule);

    const savedLastSync =
      settings?.customSettings?.helloWorldComputerUse?.lastSyncTime;
    if (savedLastSync) setLastSyncTime(savedLastSync);
  }, [settings]);

  const extractAndSyncData = async () => {
    try {
      // get browser name
      const browser = getBrowserName();

      setIsLoading(true);
      const t = toast({
        title: "starting data extraction",
        description: "please do not close the chosen app",
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      // open the app
      t.update({
        id: t.id,
        title: "opening app",
        description: "please do not close the chosen app",
      });

      console.log("opening app", app);

      await pipe.operator.openApplication(app);

      t.update({
        id: t.id,
        title: "extracting data",
        description: "please do not close the chosen app",
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const appElement = pipe.operator.getByAppName(app);
      const text = await appElement.first();
      console.log("text", text?.text);

      // Wait for the page to be fully loaded
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Save storage path and settings
      await updateSettings({
        customSettings: {
          helloWorldComputerUse: {
            app,
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

      // now open back current app (eg tauri app is "screenpipe" otherwise get browser name)
      await pipe.operator.openApplication(tauri ? "screenpipe" : browser);

      toast({
        title: "data saved to csv",
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
      // for tauri apps, use the native dialog directly which gives absolute path
      const selectedPath = await tauri.dialog.open({
        directory: true,
        multiple: false,
        title: "select csv storage directory",
      });

      if (selectedPath === null) {
        return; // user canceled
      }

      setCsvStoragePath(selectedPath);
      setPathValidation({
        isValid: true,
        message: "path selected: " + selectedPath,
      });

      // Save to settings
      await updateSettings({
        customSettings: {
          helloWorldComputerUse: {
            app,
            csvStoragePath: selectedPath,
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

  const getBrowserName = () => {
    if (
      getComputedStyle(document.documentElement).getPropertyValue(
        "--arc-palette-title"
      )
    )
      return "arc";
    const userAgent = window.navigator.userAgent;

    if (userAgent.includes("Firefox")) return "firefox";
    if (userAgent.includes("Edge") || userAgent.includes("Edg")) return "edge";
    if (userAgent.includes("Chrome") && !userAgent.includes("Edg"))
      return "chrome";
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
      return "safari";
    if (userAgent.includes("Opera") || userAgent.includes("OPR"))
      return "opera";

    return "unknown";
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
      <header className="w-full max-w-2xl text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">app to csv sync</h1>
        <p className="text-gray-600 dark:text-gray-400">
          scrape your computer apps into csv files
        </p>
      </header>

      <Card className="w-full max-w-2xl p-6 shadow-md">
        {/* Storage Location Setup */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">app to use</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                app to use
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="app name"
                  value={app}
                  onChange={(e) => {
                    setApp(e.target.value);
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                what app to use for data extraction
              </p>
            </div>

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
                  // disable on web due to browser security
                  disabled={isLoading || !tauri}
                  className="px-3"
                  title="select directory"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                where to save data extraction csv files (use absolute path)
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
                onClick={extractAndSyncData}
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
            <li>click "sync now"</li>
            <li>csv files will be saved with date-based filenames</li>
            <li>each sync creates a new csv file with timestamp</li>
          </ol>
        </div>
      </Card>

      <footer className="w-full max-w-2xl mt-6 text-center text-xs text-gray-500">
        <p>desktop app to csv sync by screenpipe</p>
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
