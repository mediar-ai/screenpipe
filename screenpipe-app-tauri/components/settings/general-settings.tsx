"use client";

import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="font-medium">auto-update pipes</h4>
            <p className="text-sm text-muted-foreground">
              automatically update pipes when updates are available
            </p>
          </div>
          <Switch
            id="auto-update-toggle"
            checked={settings.autoUpdatePipes}
            onCheckedChange={(checked) =>
              handleSettingsChange({ autoUpdatePipes: checked })
            }
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium">screenpipe server</h4>
            <p className="text-sm text-muted-foreground">
              configure the host and port for connecting to a screenpipe instance
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="screenpipe-host">host</Label>
              <Input
                id="screenpipe-host"
                type="text"
                value={settings.screenpipeHost}
                onChange={(e) =>
                  handleSettingsChange({ screenpipeHost: e.target.value })
                }
                placeholder="localhost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screenpipe-port">port</Label>
              <Input
                id="screenpipe-port"
                type="number"
                value={settings.port}
                onChange={(e) =>
                  handleSettingsChange({ port: parseInt(e.target.value) || 3030 })
                }
                placeholder="3030"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
