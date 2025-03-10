import { useState, useEffect } from "react";
import { Settings } from "@/lib/types";
import {
  getScreenpipeAppSettings,
  updateScreenpipeAppSettings,
} from "../actions/get-screenpipe-app-settings";


export function usePipeSettings() {
  const [settings, setSettings] = useState<Partial<Settings> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load screenpipe app settings directly
      const settings = await getScreenpipeAppSettings();
      
      console.log("loaded raw settings:", {
        hasAiProvider: !!settings.aiProviderType,
        hasToken: !!settings.user?.token,
        hasOpenaiKey: !!settings.openaiApiKey,
        aiUrl: settings.aiUrl
      });
      
      setSettings(settings as Partial<Settings>);
    } catch (error) {
      console.error("failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      await updateScreenpipeAppSettings(newSettings);
      setSettings(newSettings);
      return true;
    } catch (error) {
      console.error("failed to update settings:", error);
      return false;
    }
  };

  return { settings, updateSettings, loading };
}
