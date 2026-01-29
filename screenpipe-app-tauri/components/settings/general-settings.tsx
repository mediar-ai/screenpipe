"use client";

import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useTheme } from "@/components/theme-provider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Rocket, Moon, Sun, Monitor, FlaskConical, Shield, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Settings } from "@/lib/hooks/use-settings";
import { open } from "@tauri-apps/plugin-shell";

export default function GeneralSettings() {
  const { settings, updateSettings } = useSettings();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

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
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          General Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Configure basic application preferences and behavior
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Rocket className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Auto-start Application
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Automatically launch screenpipe when your computer starts up. 
                    This ensures you never miss capturing important moments.
                  </p>
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

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Monitor className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Theme
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Choose your preferred theme. System follows your device settings automatically.
                  </p>
                </div>
              </div>
              
              <div className="space-y-3 ml-16">
                {themeOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <label
                      key={option.value}
                      className="flex items-center space-x-3 cursor-pointer group"
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
                        flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors
                        ${theme === option.value 
                          ? 'border-primary bg-primary' 
                          : 'border-muted-foreground group-hover:border-primary'
                        }
                      `}>
                        {theme === option.value && (
                          <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FlaskConical className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Try Beta Version
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Get early access to new features. The beta app runs separately alongside this stable version.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDownloadBeta}
                className="ml-4 flex items-center gap-2"
              >
                <FlaskConical className="h-4 w-4" />
                Download Beta
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4">
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary">
            Auto-start ensures continuous recording so you never miss capturing important moments.
          </p>
        </div>
      </div>
    </div>
  );
}
