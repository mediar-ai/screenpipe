"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useProfiles = exports.profilesStore = void 0;
const easy_peasy_1 = require("easy-peasy");
const plugin_store_1 = require("@tauri-apps/plugin-store");
const path_1 = require("@tauri-apps/api/path");
const utils_1 = require("../utils");
const easy_peasy_2 = require("easy-peasy");
const use_settings_1 = require("./use-settings");
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
let profilesStorePromise = null;
/**
 * @warning Do not change autoSave to true, it causes race conditions
 */
const getProfilesStore = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!profilesStorePromise) {
        profilesStorePromise = (() => __awaiter(void 0, void 0, void 0, function* () {
            const dir = yield (0, path_1.localDataDir)();
            console.log(dir, "dir");
            return new plugin_store_1.LazyStore(`${dir}/screenpipe/profiles.bin`, {
                autoSave: false,
            });
        }))();
    }
    return profilesStorePromise;
});
const profilesStorage = {
    getItem: (_key) => __awaiter(void 0, void 0, void 0, function* () {
        yield new Promise((resolve) => setTimeout(resolve, 2000));
        const tauriStore = yield getProfilesStore();
        const allKeys = yield tauriStore.keys();
        const values = {};
        for (const k of allKeys) {
            values[k] = yield tauriStore.get(k);
        }
        return (0, utils_1.unflattenObject)(values);
    }),
    setItem: (_key, value) => __awaiter(void 0, void 0, void 0, function* () {
        const tauriStore = yield getProfilesStore();
        const flattenedValue = (0, utils_1.flattenObject)(value);
        const existingKeys = yield tauriStore.keys();
        for (const key of existingKeys) {
            yield tauriStore.delete(key);
        }
        for (const [key, val] of Object.entries(flattenedValue)) {
            yield tauriStore.set(key, val);
        }
        yield tauriStore.save();
    }),
    removeItem: (_key) => __awaiter(void 0, void 0, void 0, function* () {
        const tauriStore = yield getProfilesStore();
        const keys = yield tauriStore.keys();
        for (const key of keys) {
            yield tauriStore.delete(key);
        }
        yield tauriStore.save();
    }),
};
const copyProfileSettings = (profileName, currentSettings) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dir = yield (0, path_1.localDataDir)();
        const fileName = `store-${profileName}.bin`;
        console.log(`copying profile settings to ${fileName}`);
        const store = new plugin_store_1.LazyStore(`${dir}/screenpipe/${fileName}`, {
            autoSave: false,
        });
        // Start with default settings
        const defaultSettings = (0, use_settings_1.createDefaultSettingsObject)();
        const flattenedDefaults = (0, utils_1.flattenObject)(defaultSettings);
        // Define keys to copy from current settings
        const keysToCopy = [
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
        ];
        // Copy specific keys from current settings
        const flattenedCurrentSettings = (0, utils_1.flattenObject)(currentSettings);
        for (const key of keysToCopy) {
            const value = flattenedCurrentSettings[key];
            if (value !== undefined) {
                yield store.set(key, value);
            }
        }
        // Set all other keys to defaults
        for (const [key, value] of Object.entries(flattenedDefaults)) {
            if (!keysToCopy.includes(key)) {
                yield store.set(key, value);
            }
        }
        yield store.save();
        console.log(`successfully copied profile settings to ${fileName}`);
    }
    catch (err) {
        console.error(`failed to copy profile settings: ${err}`);
        throw new Error(`failed to copy profile settings: ${err}`);
    }
});
const deleteProfileFile = (profile) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dir = yield (0, path_1.localDataDir)();
        const file = profile === "default" ? "store.bin" : `store-${profile}.bin`;
        yield (0, plugin_fs_1.remove)(`${dir}/screenpipe/${file}`);
    }
    catch (err) {
        console.error(`failed to delete profile file: ${err}`);
        throw new Error(`failed to delete profile file: ${err}`);
    }
});
exports.profilesStore = (0, easy_peasy_2.createContextStore)((0, easy_peasy_1.persist)({
    activeProfile: "default",
    profiles: ["default"],
    shortcuts: {},
    setActiveProfile: (0, easy_peasy_1.action)((state, payload) => {
        state.activeProfile = payload;
    }),
    updateShortcut: (0, easy_peasy_1.action)((state, { profile, shortcut }) => {
        if (shortcut === '') {
            delete state.shortcuts[profile];
        }
        else {
            state.shortcuts[profile] = shortcut;
        }
    }),
    createProfile: (0, easy_peasy_1.action)((state, payload) => {
        state.profiles.push(payload.profileName);
        copyProfileSettings(payload.profileName, payload.currentSettings).catch((err) => console.error(`failed to create profile ${payload.profileName}: ${err}`));
    }),
    deleteProfile: (0, easy_peasy_1.action)((state, payload) => {
        if (payload === "default") {
            console.error("cannot delete default profile");
            return;
        }
        state.profiles = state.profiles.filter((profile) => profile !== payload);
        deleteProfileFile(payload).catch((err) => console.error(`failed to delete profile ${payload}: ${err}`));
    }),
}, {
    storage: profilesStorage,
}));
const useProfiles = () => {
    const { profiles, activeProfile, shortcuts } = exports.profilesStore.useStoreState((state) => ({
        activeProfile: state.activeProfile,
        profiles: state.profiles,
        shortcuts: state.shortcuts,
    }));
    const setActiveProfile = exports.profilesStore.useStoreActions((actions) => actions.setActiveProfile);
    const createProfile = exports.profilesStore.useStoreActions((actions) => actions.createProfile);
    const deleteProfile = exports.profilesStore.useStoreActions((actions) => actions.deleteProfile);
    const updateShortcut = exports.profilesStore.useStoreActions((actions) => actions.updateShortcut);
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
exports.useProfiles = useProfiles;
