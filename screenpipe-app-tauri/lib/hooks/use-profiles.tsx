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
        defaults: {}, // FIX: Added defaults to satisfy the updated Tauri StoreOptions requirement
      });
    })();
  }
  return profilesStorePromise;
};

const profilesStorage = {
  getItem: async (key: string) => {
    const store = await getProfilesStore();
    const value = await store.get(key);
    return JSON.parse(value as string);
  },
  setItem: async (key: string, value: any) => {
    const store = await getProfilesStore();
    await store.set(key, JSON.stringify(value));
    await store.save();
  },
  removeItem: async (key: string) => {
    const store = await getProfilesStore();
    await store.delete(key);
    await store.save();
  },
};

const deleteProfileFile = async (profileName: string) => {
  const dir = await localDataDir();
  await remove(`${dir}/screenpipe/profiles/${profileName}.bin`);
};

export const profilesStore = createContextStore<ProfilesModel>(
  persist(
    {
      activeProfile: "default",
      profiles: ["default"],
      shortcuts: {
        default: "ctrl+space",
      },

      setActiveProfile: action((state, payload) => {
        if (!state.profiles.includes(payload)) {
          console.error(`profile ${payload} does not exist`);
          return;
        }
        state.activeProfile = payload;
      }),

      updateShortcut: action((state, payload) => {
        state.shortcuts[payload.profile] = payload.shortcut;
      }),
      createProfile: action((state, payload) => {
        if (state.profiles.includes(payload.profileName)) {
          console.error(`profile ${payload.profileName} already exists`);
          return;
        }

        const createStore = async () => {
          const dir = await localDataDir();
          const store = new LazyStore(
            `${dir}/screenpipe/profiles/${payload.profileName}.bin`,
            { autoSave: false, defaults: {} }
          );

          await store.set("settings", JSON.stringify(payload.currentSettings));
          await store.save();
        };

        createStore()
          .then(() => {
            state.profiles.push(payload.profileName);
          })
          .catch((err) =>
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
    shortcuts,
    setActiveProfile,
    createProfile,
    deleteProfile,
    updateShortcut,
  };
};