"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { localDataDir } from "@tauri-apps/api/path";
import { Store } from "@tauri-apps/plugin-store";
import {
  EduPipeSettings,
  DEFAULT_EDUPIPE_SETTINGS,
  CanvasConfig,
  StudentProfile,
  EduPipePrivacySettings,
} from "./types";

// Store singleton for EduPipe
let _eduPipeStore: Promise<Store> | undefined;

export const getEduPipeStore = async () => {
  if (!_eduPipeStore) {
    const dir = await localDataDir();
    _eduPipeStore = Store.load(`${dir}/screenpipe/edupipe-store.bin`, {
      autoSave: false,
      defaults: {},
    });
  }
  return _eduPipeStore;
};

// Store utilities
function createEduPipeSettingsStore() {
  const get = async (): Promise<EduPipeSettings> => {
    const store = await getEduPipeStore();
    const settings = await store.get<EduPipeSettings>("edupipe_settings");
    return settings ? { ...DEFAULT_EDUPIPE_SETTINGS, ...settings } : DEFAULT_EDUPIPE_SETTINGS;
  };

  const set = async (value: Partial<EduPipeSettings>) => {
    const store = await getEduPipeStore();
    const current = await get();
    const newSettings = deepMerge(current, value);
    await store.set("edupipe_settings", newSettings);
    await store.save();
  };

  const reset = async () => {
    const store = await getEduPipeStore();
    await store.set("edupipe_settings", DEFAULT_EDUPIPE_SETTINGS);
    await store.save();
  };

  const listen = (callback: (settings: EduPipeSettings) => void) => {
    return getEduPipeStore().then((store) => {
      return store.onKeyChange("edupipe_settings", (newValue: EduPipeSettings | null | undefined) => {
        callback(newValue ? { ...DEFAULT_EDUPIPE_SETTINGS, ...newValue } : DEFAULT_EDUPIPE_SETTINGS);
      });
    });
  };

  return {
    get,
    set,
    reset,
    listen,
  };
}

// Deep merge utility
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = output[key];
      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        (output as Record<string, unknown>)[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        (output as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  return output;
}

const eduPipeSettingsStore = createEduPipeSettingsStore();

// Context for React
interface EduPipeSettingsContextType {
  settings: EduPipeSettings;
  isLoaded: boolean;
  error: string | null;

  // General updates
  updateSettings: (updates: Partial<EduPipeSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;

  // Canvas-specific
  updateCanvasConfig: (config: Partial<CanvasConfig>) => Promise<void>;
  disconnectCanvas: () => Promise<void>;

  // Profile-specific
  updateProfile: (profile: Partial<StudentProfile>) => Promise<void>;

  // Privacy-specific
  updatePrivacy: (privacy: Partial<EduPipePrivacySettings>) => Promise<void>;
  addPrivateApp: (app: string) => Promise<void>;
  removePrivateApp: (app: string) => Promise<void>;

  // Onboarding
  completeEduPipeOnboarding: () => Promise<void>;
  isOnboardingComplete: boolean;
}

const EduPipeSettingsContext = createContext<EduPipeSettingsContextType | undefined>(undefined);

export const EduPipeSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<EduPipeSettings>(DEFAULT_EDUPIPE_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await eduPipeSettingsStore.get();
        setSettings(loadedSettings);
        setIsLoaded(true);
        setError(null);
      } catch (err) {
        console.error("Failed to load EduPipe settings:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoaded(true);
      }
    };

    loadSettings();

    // Listen for changes
    const unsubscribe = eduPipeSettingsStore.listen((newSettings) => {
      setSettings(newSettings);
    });

    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<EduPipeSettings>) => {
    await eduPipeSettingsStore.set(updates);
  }, []);

  const resetSettings = useCallback(async () => {
    await eduPipeSettingsStore.reset();
  }, []);

  const updateCanvasConfig = useCallback(async (config: Partial<CanvasConfig>) => {
    await updateSettings({
      canvas: { ...settings.canvas, ...config },
    });
  }, [settings.canvas, updateSettings]);

  const disconnectCanvas = useCallback(async () => {
    await updateSettings({
      canvas: {
        ...DEFAULT_EDUPIPE_SETTINGS.canvas,
        domain: settings.canvas.domain, // Keep domain for reconnection
      },
    });
  }, [settings.canvas.domain, updateSettings]);

  const updateProfile = useCallback(async (profile: Partial<StudentProfile>) => {
    await updateSettings({
      profile: {
        ...settings.profile,
        ...profile,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [settings.profile, updateSettings]);

  const updatePrivacy = useCallback(async (privacy: Partial<EduPipePrivacySettings>) => {
    await updateSettings({
      privacy: { ...settings.privacy, ...privacy },
    });
  }, [settings.privacy, updateSettings]);

  const addPrivateApp = useCallback(async (app: string) => {
    if (!settings.privacy.privateApps.includes(app)) {
      await updatePrivacy({
        privateApps: [...settings.privacy.privateApps, app],
      });
    }
  }, [settings.privacy.privateApps, updatePrivacy]);

  const removePrivateApp = useCallback(async (app: string) => {
    await updatePrivacy({
      privateApps: settings.privacy.privateApps.filter((a) => a !== app),
    });
  }, [settings.privacy.privateApps, updatePrivacy]);

  const completeEduPipeOnboarding = useCallback(async () => {
    await updateSettings({
      onboarding: {
        ...settings.onboarding,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    });
  }, [settings.onboarding, updateSettings]);

  const value: EduPipeSettingsContextType = {
    settings,
    isLoaded,
    error,
    updateSettings,
    resetSettings,
    updateCanvasConfig,
    disconnectCanvas,
    updateProfile,
    updatePrivacy,
    addPrivateApp,
    removePrivateApp,
    completeEduPipeOnboarding,
    isOnboardingComplete: settings.onboarding.completed,
  };

  return (
    <EduPipeSettingsContext.Provider value={value}>
      {children}
    </EduPipeSettingsContext.Provider>
  );
};

export function useEduPipeSettings(): EduPipeSettingsContextType {
  const context = useContext(EduPipeSettingsContext);
  if (context === undefined) {
    throw new Error("useEduPipeSettings must be used within an EduPipeSettingsProvider");
  }
  return context;
}
