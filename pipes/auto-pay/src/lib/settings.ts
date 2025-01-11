import { create } from 'zustand';
import type { Settings } from '@screenpipe/js';

interface AutoPaySettings {
  wiseApiKey: string;
  wiseProfileId: string;
  enableProduction: boolean;
  mercuryApiKey: string;
  mercuryAccountId: string;
}

interface CustomSettings {
  'auto-pay': AutoPaySettings;
  [key: string]: unknown;
}

// Extend the original Settings interface
interface ExtendedSettings extends Settings {
  customSettings?: CustomSettings;
}

export interface SettingsState {
  settings: Settings | null;
  wiseApiKey: string | null;
  wiseProfileId: string | null;
  enableProduction: boolean;
  openaiApiKey: string | null;
  mercuryApiKey: string | null;
  mercuryAccountId: string | null;
  setSettings: (settings: Settings) => void;
  updateSettings: (partialSettings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  wiseApiKey: null,
  wiseProfileId: null,
  enableProduction: false,
  openaiApiKey: null,
  mercuryApiKey: null,
  mercuryAccountId: null,
  setSettings: (settings) => {
    const customSettings = settings.customSettings?.['auto-pay'] || {};
    set({
      settings,
      wiseApiKey: customSettings.wiseApiKey || null,
      wiseProfileId: customSettings.wiseProfileId || null,
      enableProduction: customSettings.enableProduction || false,
      openaiApiKey: settings.openaiApiKey || null,
      mercuryApiKey: customSettings.mercuryApiKey || null,
      mercuryAccountId: customSettings.mercuryAccountId || null,
    });
  },
  updateSettings: (partialSettings) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...partialSettings } : null,
    })),
}));

export async function fetchSettings(): Promise<ExtendedSettings> {
  const response = await fetch('/api/settings');
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  return response.json();
}

export async function updateSettings(settings: Partial<Settings>) {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      namespace: 'auto-pay',
      isPartialUpdate: true,
      value: settings,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update settings');
  }
  return response.json();
}

// Helper to get typed auto-pay settings from ExtendedSettings object
export function getAutoPaySettingsFromExtended(settings: ExtendedSettings): AutoPaySettings {
  return settings.customSettings?.['auto-pay'] ?? {
    wiseApiKey: '',
    wiseProfileId: '',
    enableProduction: false,
    mercuryApiKey: '',
    mercuryAccountId: ''
  };
}      