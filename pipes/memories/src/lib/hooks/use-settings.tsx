"use client";

import { useState, useEffect } from "react";
import { getDefaultSettings, type Settings } from "@screenpipe/browser";

export function useSettings() {
  const defaultSettings = getDefaultSettings();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      if (!loading) setLoading(true);
      try {
        const response = await fetch("/api/settings");
        const data = await response.json();
        setSettings({ ...defaultSettings, ...data });
      } catch (err) {
        console.error("failed to load settings:", err);
        setSettings(defaultSettings);
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
    value: Settings[T],
    namespace?: string
  ) => {
    if (!settings) return;
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value, namespace }),
      });

      if (namespace) {
        setSettings((prev) => {
          if (!prev) return defaultSettings;
          return {
            ...prev,
            customSettings: {
              ...prev.customSettings,
              [namespace]: {
                ...(prev.customSettings?.[namespace] || {}),
                [key]: value,
              },
            },
          };
        });
      } else {
        setSettings((prev) => {
          if (!prev) return defaultSettings;
          return { ...prev, [key]: value };
        });
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  const updateSettings = async (
    newSettings: Partial<Settings>,
    namespace?: string
  ) => {
    if (!settings) return;
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          value: newSettings,
          isPartialUpdate: true,
          namespace,
        }),
      });

      if (namespace) {
        setSettings((prev) => {
          if (!prev) return defaultSettings;
          return {
            ...prev,
            customSettings: {
              ...prev.customSettings,
              [namespace]: {
                ...(prev.customSettings?.[namespace] || {}),
                ...newSettings,
              },
            },
          };
        });
      } else {
        setSettings((prev) => {
          if (!prev) return defaultSettings;
          return { ...prev, ...newSettings };
        });
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  const resetSettings = async (
    settingKey?: keyof Settings,
    namespace?: string
  ) => {
    if (!settings) return;
    try {
      await fetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ reset: true, key: settingKey, namespace }),
      });

      if (namespace) {
        setSettings((prev) => {
          if (!prev) return defaultSettings;
          if (settingKey) {
            return {
              ...prev,
              customSettings: {
                ...prev.customSettings,
                [namespace]: {
                  ...(prev.customSettings?.[namespace] || {}),
                  [settingKey]: undefined,
                },
              },
            };
          } else {
            return {
              ...prev,
              customSettings: {
                ...prev.customSettings,
                [namespace]: {},
              },
            };
          }
        });
      } else {
        if (settingKey) {
          setSettings((prev) => {
            if (!prev) return defaultSettings;
            return {
              ...prev,
              [settingKey]: defaultSettings[settingKey],
            };
          });
        } else {
          setSettings(defaultSettings);
        }
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  return {
    settings: settings || defaultSettings,
    loading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
  };
}
