import { Action, action, persist } from "easy-peasy";
import { LazyStore } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { flattenObject, unflattenObject } from "../utils";
import { createContextStore } from "easy-peasy";

export interface ProfilesModel {
  activeProfile: string;
  profiles: string[];
  setActiveProfile: Action<ProfilesModel, string>;
  createProfile: Action<ProfilesModel, string>;
  deleteProfile: Action<ProfilesModel, string>;
}

let profilesStorePromise: Promise<LazyStore> | null = null;

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

export const profilesStore = createContextStore<ProfilesModel>(
  persist(
    {
      activeProfile: "default",
      profiles: ["default"],
      setActiveProfile: action((state, payload) => {
        state.activeProfile = payload;
      }),
      createProfile: action((state, payload) => {
        state.profiles.push(payload);
      }),
      deleteProfile: action((state, payload) => {
        state.profiles = state.profiles.filter(
          (profile) => profile !== payload
        );
      }),
    },
    {
      storage: profilesStorage,
    }
  )
);

export const useProfiles = () => {
  const { profiles, activeProfile } = profilesStore.useStoreState((state) => ({
    activeProfile: state.activeProfile,
    profiles: state.profiles,
  }));
  const setActiveProfile = profilesStore.useStoreActions(
    (actions) => actions.setActiveProfile
  );
  const createProfile = profilesStore.useStoreActions(
    (actions) => actions.createProfile
  );
  const deleteProfile = profilesStore.useStoreActions(
    (actions) => actions.deleteProfile
  );

  return {
    profiles,
    activeProfile,
    setActiveProfile,
    createProfile,
    deleteProfile,
  };
};
