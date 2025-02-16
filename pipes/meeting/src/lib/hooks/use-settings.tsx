"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import type { Settings } from "@screenpipe/browser";
import { getDefaultSettings } from "@screenpipe/browser";
import { isEqual } from 'lodash'

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  error: Error | null;
  updateSetting: <T extends keyof Settings>(key: T, value: Settings[T]) => Promise<void>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  resetSettings: (settingKey?: keyof Settings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const defaultSettings = getDefaultSettings();
  
  // Hardcode the token in the initial settings
  const initialSettings = {
    ...defaultSettings,
    aiProviderType: "screenpipe-cloud" as const,
    user: {
      ...defaultSettings.user,
      token: "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18ycGFFR0Jxc0dEYTZXcVlyaEFySjdtS0o0elYiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL3NjcmVlbnBpLnBlIiwiZXhwIjoyMDU0MzI2MDkyLCJpYXQiOjE3Mzg5NjYwOTIsImlzcyI6Imh0dHBzOi8vY2xlcmsuc2NyZWVucGkucGUiLCJqdGkiOiI3NzkxM2JlYTQxNGUxZGEyOGYyNCIsIm5iZiI6MTczODk2NjA4Nywic3ViIjoidXNlcl8yc2pQYjhlTEwyVTNTWU9TZDZkZnVsdUdrZlIifQ.FUNvk3iJVZa9JP1aq-qa6ta9DvtvW1piiUE5AQA7RydDHCkHPzQedPriLBuVKaZt9bLlPmdLOv2vK-qsB1bgVzSXUFXiPSC-OdySH7Do3WLQIEz-9YX4J-LaC8FSrOkvxjWch6uTev0k2-gdOyhClOOGpKR3qIHPDRy5eftZpw0Mc3cGmJp4AjWIAKllBKoa3F0DGN0WIUBM1GwpPw5e1nTJ3F9BDFf_dNwJmQ5MWCFXJXjC9mX4K0xbT3AkWJqQdXopP2wZlnAWwLyURWbWthZEqMCZEQQwCm5P7tW7GIAkWpiouHoaLT9C90YNYsI2j8EkPCbIPieDfncXXiWNQA"
    },
    aiUrl: "https://ai-proxy.i-f9f.workers.dev/v1",
    aiModel: "gpt-4o",
    analyticsEnabled: true
  };

  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) {
          console.log("using default settings (web mode)")
          return; // Don't update if using defaults
        }
        const data = await response.json();
        
        // Only update settings if they've actually changed
        const newSettings = { 
          ...initialSettings, 
          ...data,
          aiProviderType: "screenpipe-cloud",
          user: {
            ...initialSettings.user,
            ...data.user,
            token: initialSettings.user.token,
            clerk_id: initialSettings.user.clerk_id,
            id: initialSettings.user.id,
            email: initialSettings.user.email
          },
          aiUrl: initialSettings.aiUrl,
          aiModel: initialSettings.aiModel
        };

        // Only update if settings actually changed
        setSettings(prev => isEqual(prev, newSettings) ? prev : newSettings);
      } catch (err) {
        console.log("failed to load settings, using defaults:", err)
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

  const value = {
    settings,
    loading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
