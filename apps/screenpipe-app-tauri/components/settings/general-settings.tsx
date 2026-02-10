"use client";

import React, { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useTheme } from "@/components/theme-provider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Rocket, Moon, Sun, Monitor, FlaskConical, Shield, ExternalLink, Layers, RefreshCw, Undo2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Settings } from "@/lib/hooks/use-settings";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { UpdateBanner } from "@/components/update-banner";

export default function GeneralSettings() {
  const { settings, updateSettings } = useSettings();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => {});
    invoke<string | null>("get_rollback_version").then(setRollbackVersion).catch(() => {});
  }, []);

  const handleSettingsChange = (newSettings: Partial<Settings>) => {
    if (settings) {
      updateSettings(newSettings);
    }
  };

  const themeOptions = [
    {
      value: "system" as const,
      label: "System",
      description: "Use system preference",
      icon: Monitor,
    },
    {
      value: "light" as const,
      label: "Light",
      description: "Light theme",
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: "Dark",
      description: "Dark theme",
      icon: Moon,
    },
  ];

  const handleRollback = async () => {
    if (!rollbackVersion || isRollingBack) return;
    setIsRollingBack(true);
    try {
      toast({
        title: "rolling back...",
        description: `restoring v${rollbackVersion}. the app will restart.`,
        duration: 5000,
      });
      await invoke("rollback_to_previous_version");
    } catch (e: any) {
      setIsRollingBack(false);
      toast({
        title: "rollback failed",
        description: e?.toString() || "unknown error",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleDownloadBeta = async () => {
    // Open the beta download page
    await open("https://screenpi.pe/beta");
    toast({
      title: "Opening beta download",
      description: "Download the beta app to run it alongside stable",
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            General
          </h1>
          <UpdateBanner compact />
        </div>
        <p className="text-muted-foreground text-sm">
          App preferences and behavior
        </p>
      </div>

      <div className="space-y-2">
        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Rocket className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">Auto-start</h3>
                  <p className="text-xs text-muted-foreground">Launch when your computer starts</p>
                </div>
              </div>
              <Switch
                id="auto-start-toggle"
                checked={settings?.autoStartEnabled ?? false}
                onCheckedChange={(checked) =>
                  handleSettingsChange({ autoStartEnabled: checked })
                }
                className="ml-4"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">Auto-update</h3>
                  <p className="text-xs text-muted-foreground">Install updates automatically</p>
                </div>
              </div>
              <Switch
                id="auto-update-toggle"
                checked={settings?.autoUpdate ?? true}
                onCheckedChange={(checked) =>
                  handleSettingsChange({ autoUpdate: checked })
                }
                className="ml-4"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Undo2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Version{currentVersion ? ` ${currentVersion}` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {rollbackVersion && rollbackVersion !== currentVersion
                      ? `previous: v${rollbackVersion}`
                      : "no previous version saved yet"}
                  </p>
                </div>
              </div>
              {rollbackVersion && rollbackVersion !== currentVersion && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRollback}
                  disabled={isRollingBack}
                  className="ml-4 h-7 text-xs"
                >
                  {isRollingBack ? "rolling back..." : `rollback to v${rollbackVersion}`}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="space-y-2.5">
              <div className="flex items-center space-x-2.5">
                <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                <h3 className="text-sm font-medium text-foreground">Theme</h3>
              </div>
              <div className="flex gap-3 ml-[26px]">
                {themeOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <label
                      key={option.value}
                      className="flex items-center space-x-2 cursor-pointer group"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={option.value}
                        checked={theme === option.value}
                        onChange={() => setTheme(option.value)}
                        className="sr-only"
                      />
                      <div className={`
                        flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 transition-colors
                        ${theme === option.value 
                          ? 'border-primary bg-primary' 
                          : 'border-muted-foreground group-hover:border-primary'
                        }
                      `}>
                        {theme === option.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <IconComponent className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{option.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="space-y-2.5">
              <div className="flex items-center space-x-2.5">
                <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    Timeline Mode
                    <HelpTooltip text="Controls how the timeline overlay appears. 'Native' uses a system overlay, 'Tauri' uses the app window." />
                  </h3>
                  <p className="text-xs text-muted-foreground">Reopen timeline to apply</p>
                </div>
              </div>
              <div className="flex gap-2 ml-[26px]">
                {([
                  { value: "fullscreen", label: "Overlay", desc: "Floating panel" },
                  { value: "window", label: "Window", desc: "Resizable window" },
                ]).map((option) => {
                  const isActive = (settings?.overlayMode ?? "fullscreen") === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={async () => {
                        handleSettingsChange({ overlayMode: option.value });
                        try {
                          const { invoke } = await import("@tauri-apps/api/core");
                          await invoke("reset_main_window");
                        } catch (_) {}
                        toast({
                          title: "overlay mode updated",
                          description: `press the shortcut to open timeline in ${option.label.toLowerCase()} mode.`,
                        });
                      }}
                      type="button"
                      className={`flex-1 px-2.5 py-1.5 rounded-md border-2 transition-all text-left cursor-pointer ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="font-medium text-xs text-foreground">{option.label}</div>
                      <div className="text-[11px] text-muted-foreground">{option.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">Beta Version</h3>
                  <p className="text-xs text-muted-foreground">Runs alongside stable</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadBeta}
                className="ml-4 flex items-center gap-1.5 h-7 text-xs"
              >
                Download
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    Show Overlay in Screen Recording
                    <HelpTooltip text="When enabled, the screenpipe overlay will be visible in screen recordings and screenshots made by other apps like OBS or Screen Studio." />
                  </h3>
                  <p className="text-xs text-muted-foreground">Let OBS, Screen Studio capture the overlay</p>
                </div>
              </div>
              <Switch
                checked={settings?.showOverlayInScreenRecording ?? false}
                onCheckedChange={(checked) => {
                  handleSettingsChange({ showOverlayInScreenRecording: checked });
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("reset_main_window").catch(() => {});
                  });
                  toast({
                    title: checked ? "overlay visible to screen recorders" : "overlay hidden from screen recorders",
                    description: "press the shortcut to open the overlay with the new setting.",
                  });
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
