"use client";

import { useState, useEffect } from "react";
import type { Settings } from "@screenpipe/browser";
import { getDefaultSettings } from "@screenpipe/browser";

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
        if (!response.ok) {
          // If API fails (e.g. on web), fallback to default settings
          console.log("using default settings (web mode)")
          setSettings(defaultSettings);
          return;
        }
        const data = await response.json();
        setSettings({ ...defaultSettings, ...data });
      } catch (err) {
        console.log("failed to load settings, using defaults:", err)
        // Fallback to default settings on error
        setSettings(defaultSettings);
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
      const response = await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value }),
      });
      
      if (!response.ok) {
        // For web users, just update state without persistence
        console.log("updating settings in memory only (web mode)")
        setSettings((prev) => ({ ...prev, [key]: value }));
        return;
      }
      
      setSettings((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      console.log("failed to update setting, updating in memory:", err)
      // Update state even if API fails
      setSettings((prev) => ({ ...prev, [key]: value }));
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ value: newSettings, isPartialUpdate: true }),
      });
      
      if (!response.ok) {
        // For web users, just update state without persistence
        console.log("updating settings in memory only (web mode)")
        setSettings((prev) => ({ ...prev, ...newSettings }));
        return;
      }
      
      setSettings((prev) => ({ ...prev, ...newSettings }));
    } catch (err) {
      console.log("failed to update settings, updating in memory:", err)
      // Update state even if API fails
      setSettings((prev) => ({ ...prev, ...newSettings }));
    }
  };

  const resetSettings = async (settingKey?: keyof Settings) => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ reset: true, key: settingKey }),
      });
      
      if (!response.ok) {
        // For web users, just update state without persistence
        console.log("resetting settings in memory only (web mode)")
        if (settingKey) {
          setSettings((prev) => ({
            ...prev,
            [settingKey]: defaultSettings[settingKey],
          }));
        } else {
          setSettings(defaultSettings);
        }
        return;
      }

      if (settingKey) {
        setSettings((prev) => ({
          ...prev,
          [settingKey]: defaultSettings[settingKey],
        }));
      } else {
        setSettings(defaultSettings);
      }
    } catch (err) {
      console.log("failed to reset settings, updating in memory:", err)
      // Reset state even if API fails
      if (settingKey) {
        setSettings((prev) => ({
          ...prev,
          [settingKey]: defaultSettings[settingKey],
        }));
      } else {
        setSettings(defaultSettings);
      }
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
