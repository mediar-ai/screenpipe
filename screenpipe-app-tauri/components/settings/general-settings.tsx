"use client";

import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Switch } from "@/components/ui/switch";

export default function GeneralSettings() {
  const { settings, updateSettings } = useSettings();

  const handleSettingsChange = (newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings);
  };

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold mb-4">general</h1>

      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="font-medium">enable autostart</h4>
            <p className="text-sm text-muted-foreground">
              automatically launch screenpipe at startup
            </p>
          </div>
          <Switch
            id="auto-start-toggle"
            checked={settings.autoStartEnabled}
            onCheckedChange={(checked) =>
              handleSettingsChange({ autoStartEnabled: checked })
            }
          />
        </div>
      </div>
    </div>
  );
}
