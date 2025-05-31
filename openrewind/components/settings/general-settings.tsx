"use client";

import React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Rocket } from "lucide-react";

export default function GeneralSettings() {
  const { settings, updateSettings } = useSettings();

  const handleSettingsChange = (newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          General Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          Configure basic application preferences and behavior
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Rocket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Auto-start Application
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Automatically launch OpenRewind when your computer starts up. 
                    This ensures you never miss capturing important moments.
                  </p>
                </div>
              </div>
              <Switch
                id="auto-start-toggle"
                checked={settings.autoStartEnabled}
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
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            💡 <strong>Tip:</strong> Auto-start ensures continuous recording so you never miss capturing important moments.
          </p>
        </div>
      </div>
    </div>
  );
}
