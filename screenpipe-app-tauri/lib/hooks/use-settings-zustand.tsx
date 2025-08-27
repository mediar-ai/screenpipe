import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { LazyStore } from '@tauri-apps/plugin-store';
import { localDataDir, appDataDir } from '@tauri-apps/api/path';
import { platform } from '@tauri-apps/plugin-os';
import { rename, remove, exists } from '@tauri-apps/plugin-fs';
import merge from 'lodash/merge';
import localforage from 'localforage';
import posthog from 'posthog-js';
import type { Settings, User, AIPreset } from '@/lib/types/settings';
import { createDefaultSettingsObject } from '@/lib/types/settings';

// Zustand store interface
interface SettingsStore {
  // State
  settings: Settings;
  isHydrated: boolean;
  
  // Actions
  updateSettings: (update: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  resetSetting: (key: keyof Settings) => Promise<void>;
  loadUser: (token: string, forceReload?: boolean) => Promise<void>;
  reloadStore: () => Promise<void>;
  getDataDir: () => Promise<string>;
  
  // Internal
  _hydrate: () => Promise<void>;
  _persist: (settings: Partial<Settings>) => Promise<void>;
}

// Store persistence utilities
let storePromise: Promise<LazyStore> | null = null;

export const getZustandStore = async () => {
  // Prevent Tauri API calls during SSR
  if (typeof window === 'undefined') {
    throw new Error('Cannot access Tauri store during server-side rendering');
  }

  if (!storePromise) {
    storePromise = (async () => {
      const dir = await localDataDir();
      const profilesStore = new LazyStore(`${dir}/screenpipe/profiles.bin`, {
        autoSave: false,
      });
      const activeProfile = 
        (await profilesStore.get('activeProfile')) || 'default';
      const file = 
        activeProfile === 'default'
          ? `store.bin`
          : `store-${activeProfile}.bin`;
      return new LazyStore(`${dir}/screenpipe/${file}`, {
        autoSave: false,
      });
    })();
  }
  return storePromise;
};

export const resetZustandStore = () => {
  storePromise = null;
};

// Simplified persistence - no complex flattening needed
const persistSettings = async (settings: Partial<Settings>) => {
  try {
    const store = await getZustandStore();
    
    // Save each top-level setting
    for (const [key, value] of Object.entries(settings)) {
      await store.set(key, value);
    }
    
    await store.save();
  } catch (error) {
    console.error('Failed to persist settings:', error);
    throw error;
  }
};

const loadPersistedSettings = async (): Promise<Partial<Settings>> => {
  try {
    const store = await getZustandStore();
    const keys = await store.keys();
    const settings: Record<string, any> = {};
    
    for (const key of keys) {
      settings[key] = await store.get(key);
    }
    
    return settings;
  } catch (error) {
    console.error('Failed to load persisted settings:', error);
    return {};
  }
};

// User loading functionality - loads user data from API with caching
const loadUserData = async (token: string, forceReload = false): Promise<User> => {
  try {
    // Try to get from cache first (unless force reload)
    const cacheKey = `user_data_${token}`;
    if (!forceReload) {
      const cached = await localforage.getItem<{
        data: User;
        timestamp: number;
      }>(cacheKey);

      // Use cache if less than 30s old
      if (cached && Date.now() - cached.timestamp < 30000) {
        return cached.data;
      }
    }

    const response = await fetch(`https://screenpi.pe/api/user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error("Failed to verify token");
    }

    const data = await response.json();
    const userData = {
      ...data.user,
    } as User;

    // Cache the result
    await localforage.setItem(cacheKey, {
      data: userData,
      timestamp: Date.now(),
    });

    return userData;
  } catch (error) {
    console.error('Failed to load user data:', error);
    throw error;
  }
};

// Create the Zustand store
export const useSettingsZustand = create<SettingsStore>()(
  devtools(
    subscribeWithSelector(
      (set, get) => ({
        // Initial state
        settings: createDefaultSettingsObject(),
        isHydrated: false,
        
        // Actions
        updateSettings: async (update: Partial<Settings>) => {
          const currentSettings = get().settings;
          const newSettings = merge({}, currentSettings, update);
          
          // Update state immediately for optimistic updates
          set({ settings: newSettings });
          
          // Persist in background
          try {
            await get()._persist(update);
          } catch (error) {
            // Rollback on persistence error
            set({ settings: currentSettings });
            throw error;
          }
        },
        
        resetSettings: async () => {
          const defaultSettings = createDefaultSettingsObject();
          set({ settings: defaultSettings });
          
          try {
            await get()._persist(defaultSettings);
          } catch (error) {
            console.error('Failed to persist reset settings:', error);
            throw error;
          }
        },
        
        resetSetting: async (key: keyof Settings) => {
          const defaultSettings = createDefaultSettingsObject();
          const currentSettings = get().settings;
          const newSettings = {
            ...currentSettings,
            [key]: defaultSettings[key],
          };
          
          set({ settings: newSettings });
          
          try {
            await get()._persist({ [key]: defaultSettings[key] });
          } catch (error) {
            // Rollback on error
            set({ settings: currentSettings });
            throw error;
          }
        },
        
        loadUser: async (token: string, forceReload = false) => {
          try {
            const currentSettings = get().settings;
            const userData = await loadUserData(token, forceReload);
            
            // If user was not logged in before, send posthog event app_login with email
            if (!currentSettings.user?.id && userData.email) {
              posthog.capture("app_login", {
                email: userData.email,
              });
            }
            
            const newSettings = {
              ...currentSettings,
              user: userData,
            };
            
            set({ settings: newSettings });
            await get()._persist({ user: userData });
          } catch (error) {
            console.error('Failed to load user:', error);
            throw error;
          }
        },
        
        reloadStore: async () => {
          resetZustandStore();
          await get()._hydrate();
        },
        
        getDataDir: async () => {
          const currentSettings = get().settings;

          if (
            currentSettings.dataDir !== "default" &&
            currentSettings.dataDir &&
            currentSettings.dataDir !== ""
          ) {
            return currentSettings.dataDir;
          }

          // Use proper cross-platform app data directory
          // This resolves to platform-appropriate locations:
          // - macOS: ~/Library/Application Support/screenpipe
          // - Windows: %APPDATA%/screenpipe  
          // - Linux: ~/.local/share/screenpipe
          try {
            return await appDataDir();
          } catch (error) {
            console.error('Failed to get app data directory:', error);
            // Fallback to local data directory if appDataDir fails
            return await localDataDir();
          }
        },
        
        // Internal methods
        _hydrate: async () => {
          // Skip hydration during SSR
          if (typeof window === 'undefined') {
            console.warn('Attempted to hydrate settings during SSR - skipping');
            set({ isHydrated: true });
            return;
          }

          try {
            const persistedSettings = await loadPersistedSettings();
            const defaultSettings = createDefaultSettingsObject();
            const hydratedSettings = merge({}, defaultSettings, persistedSettings);
            
            set({ 
              settings: hydratedSettings,
              isHydrated: true 
            });
          } catch (error) {
            console.error('Failed to hydrate settings:', error);
            set({ 
              settings: createDefaultSettingsObject(),
              isHydrated: true 
            });
          }
        },
        
        _persist: async (update: Partial<Settings>) => {
          await persistSettings(update);
        },
      })
    ),
    { name: 'settings-store' }
  )
);

// Note: Auto-hydration removed - now handled at component level for SSR compatibility

// Export utility function for awaiting hydration
export const awaitZustandHydration = async (): Promise<void> => {
  return new Promise((resolve) => {
    if (useSettingsZustand.getState().isHydrated) {
      resolve();
      return;
    }
    
    const unsubscribe = useSettingsZustand.subscribe(
      (state) => state.isHydrated,
      (isHydrated) => {
        if (isHydrated) {
          unsubscribe();
          resolve();
        }
      }
    );
  });
};