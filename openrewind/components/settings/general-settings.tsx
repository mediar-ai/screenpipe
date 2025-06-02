"use client";

import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Rocket } from "lucide-react";
import { SettingsStore } from "@/lib/utils/tauri";

export default function GeneralSettings() {
  const { settings, updateSettings } = useSettings();
  const handleSettingsChange = (newSettings: Partial<SettingsStore>) => {
    if (settings) {
      updateSettings(newSettings);
    }
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
                    Automatically launch OpenRewind when your computer starts up. 
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


      </div>

      <div className="pt-4">
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary">
            💡 <strong>Tip:</strong> Auto-start ensures continuous recording so you never miss capturing important moments.
          </p>
        </div>
      </div>
    </div>
  );
}
