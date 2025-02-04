"use client";

import { useState, useEffect } from "react";
import { getDefaultSettings, type Settings } from "@screenpipe/browser";

export function useSettings() {
  const defaultSettings = getDefaultSettings();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings");
        const data = await response.json();
        setSettings({ ...defaultSettings, ...data });
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    loadSettings();

    // Refresh on window focus
    const onFocus = () => loadSettings();
    window.addEventListener("focus", onFocus);

    // Optional: periodic refresh every 30s
    const interval = setInterval(loadSettings, 30000);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  const updateSetting = async <T extends keyof Settings>(
    key: T,
    value: Settings[T]
  ) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value }),
      });
      setSettings((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      setError(err as Error);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ value: newSettings, isPartialUpdate: true }),
      });
      setSettings((prev) => ({ ...prev, ...newSettings }));
    } catch (err) {
      setError(err as Error);
    }
  };

  const resetSettings = async (settingKey?: keyof Settings) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ reset: true, key: settingKey }),
      });
      if (settingKey) {
        setSettings((prev) => ({
          ...prev,
          [settingKey]: defaultSettings[settingKey],
        }));
      } else {
        setSettings(defaultSettings);
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  return {
    settings,
    loading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
  };
}
