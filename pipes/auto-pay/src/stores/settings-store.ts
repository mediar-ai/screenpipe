import { create } from 'zustand';
import type { Settings } from '@screenpipe/js';

interface SettingsState {
  settings: Settings | null;
  wiseApiKey: string | null;
  wiseProfileId: string | null;
  enableProduction: boolean;
  openaiApiKey: string | null;
  setSettings: (settings: Settings) => void;
  updateSettings: (partialSettings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  wiseApiKey: null,
  wiseProfileId: null,
  enableProduction: false,
  openaiApiKey: null,
  setSettings: (settings) => {
    const customSettings = settings.customSettings?.['auto-pay'] || {};
    set({
      settings,
      wiseApiKey: customSettings.wiseApiKey || null,
      wiseProfileId: customSettings.wiseProfileId || null,
      enableProduction: customSettings.enableProduction || false,
      openaiApiKey: settings.openaiApiKey || null,
    });
  },
  updateSettings: (partialSettings) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...partialSettings } : null,
    })),
})); 