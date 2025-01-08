import { Action, action, persist } from "easy-peasy";
import { LazyStore } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { flattenObject, FlattenObjectKeys, unflattenObject } from "../utils";
import { createContextStore } from "easy-peasy";
import { createDefaultSettingsObject, Settings } from "./use-settings";
import { remove } from "@tauri-apps/plugin-fs";
export interface ProfilesModel {
  activeProfile: string;
  profiles: string[];
  shortcuts: {
    [profileName: string]: string;
  };
  setActiveProfile: Action<ProfilesModel, string>;
  createProfile: Action<
    ProfilesModel,
    {
      profileName: string;
      currentSettings: Settings;
    }
  >;
  deleteProfile: Action<ProfilesModel, string>;
  updateShortcut: Action<ProfilesModel, { profile: string; shortcut: string }>;
}

let profilesStorePromise: Promise<LazyStore> | null = null;

/**
 * @warning Do not change autoSave to true, it causes race conditions
 */
const getProfilesStore = async () => {
  if (!profilesStorePromise) {
    profilesStorePromise = (async () => {
      const dir = await localDataDir();
      console.log(dir, "dir");
      return new LazyStore(`${dir}/screenpipe/profiles.bin`, {
        autoSave: false,
      });
    })();
  }
  return profilesStorePromise;
};

const profilesStorage = {
  getItem: async (_key: string) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const tauriStore = await getProfilesStore();
    const allKeys = await tauriStore.keys();
    const values: Record<string, any> = {};

    for (const k of allKeys) {
      values[k] = await tauriStore.get(k);
    }

    return unflattenObject(values);
  },

  setItem: async (_key: string, value: any) => {
    const tauriStore = await getProfilesStore();
    const flattenedValue = flattenObject(value);

    const existingKeys = await tauriStore.keys();
    for (const key of existingKeys) {
      await tauriStore.delete(key);
    }

    for (const [key, val] of Object.entries(flattenedValue)) {
      await tauriStore.set(key, val);
    }

    await tauriStore.save();
  },
  removeItem: async (_key: string) => {
    const tauriStore = await getProfilesStore();
    const keys = await tauriStore.keys();
    for (const key of keys) {
      await tauriStore.delete(key);
    }
    await tauriStore.save();
  },
};

const copyProfileSettings = async (
  profileName: string,
  currentSettings: Settings
) => {
  try {
    const dir = await localDataDir();
    const fileName = `store-${profileName}.bin`;

    console.log(`copying profile settings to ${fileName}`);

    const store = new LazyStore(`${dir}/screenpipe/${fileName}`, {
      autoSave: false,
    });

    // Start with default settings
    const defaultSettings = createDefaultSettingsObject();
    const flattenedDefaults = flattenObject(defaultSettings);

    // Define keys to copy from current settings
    const keysToCopy: FlattenObjectKeys<Settings>[] = [
      // Account related
      "user.token",
      "user.id",
      "user.email",
      "user.name",
      "user.image",
      "user.clerk_id",
      "user.credits.amount",

      // AI related
      "aiProviderType",
      "aiUrl",
      "aiModel",
      "aiMaxContextChars",
      "openaiApiKey",

      // Shortcuts
      "showScreenpipeShortcut",
      "startRecordingShortcut",
      "stopRecordingShortcut",
      "disabledShortcuts",
    ] as const;

    // Copy specific keys from current settings
    const flattenedCurrentSettings = flattenObject(currentSettings);
    for (const key of keysToCopy) {
      const value = flattenedCurrentSettings[key];
      if (value !== undefined) {
        await store.set(key, value);
      }
    }

    // Set all other keys to defaults
    for (const [key, value] of Object.entries(flattenedDefaults)) {
      if (!keysToCopy.includes(key as FlattenObjectKeys<Settings>)) {
        await store.set(key, value);
      }
    }

    await store.save();
    console.log(`successfully copied profile settings to ${fileName}`);
  } catch (err) {
    console.error(`failed to copy profile settings: ${err}`);
    throw new Error(`failed to copy profile settings: ${err}`);
  }
};

const deleteProfileFile = async (profile: string) => {
  try {
    const dir = await localDataDir();
    const file = profile === "default" ? "store.bin" : `store-${profile}.bin`;
    await remove(`${dir}/screenpipe/${file}`);
  } catch (err) {
    console.error(`failed to delete profile file: ${err}`);
    throw new Error(`failed to delete profile file: ${err}`);
  }
};

export const profilesStore = createContextStore<ProfilesModel>(
  persist(
    {
      activeProfile: "default",
      profiles: ["default"],
      shortcuts: {},
      setActiveProfile: action((state, payload) => {
        state.activeProfile = payload;
      }),
      updateShortcut: action((state, { profile, shortcut }) => {
        if (shortcut === '') {
          delete state.shortcuts[profile];
        } else {
          state.shortcuts[profile] = shortcut;
        }
      }),
      createProfile: action((state, payload) => {
        state.profiles.push(payload.profileName);
        copyProfileSettings(payload.profileName, payload.currentSettings).catch(
          (err) =>
            console.error(
              `failed to create profile ${payload.profileName}: ${err}`
            )
        );
      }),
      deleteProfile: action((state, payload) => {
        if (payload === "default") {
          console.error("cannot delete default profile");
          return;
        }
        state.profiles = state.profiles.filter(
          (profile) => profile !== payload
        );
        deleteProfileFile(payload).catch((err) =>
          console.error(`failed to delete profile ${payload}: ${err}`)
        );
      }),
    },
    {
      storage: profilesStorage,
    }
  )
);

export const useProfiles = () => {
  const { profiles, activeProfile, shortcuts } = profilesStore.useStoreState(
    (state) => ({
      activeProfile: state.activeProfile,
      profiles: state.profiles,
      shortcuts: state.shortcuts,
    })
  );

  const setActiveProfile = profilesStore.useStoreActions(
    (actions) => actions.setActiveProfile
  );
  const createProfile = profilesStore.useStoreActions(
    (actions) => actions.createProfile
  );
  const deleteProfile = profilesStore.useStoreActions(
    (actions) => actions.deleteProfile
  );
  const updateShortcut = profilesStore.useStoreActions(
    (actions) => actions.updateShortcut
  );

  return {
    profiles,
    activeProfile,
    profileShortcuts: shortcuts,
    setActiveProfile,
    createProfile,
    deleteProfile,
    updateProfileShortcut: updateShortcut,
  };
};
