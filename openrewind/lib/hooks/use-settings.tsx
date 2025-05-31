import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "./use-pipes";
import { Language } from "@/lib/language";
import {
	action,
	Action,
	persist,
	PersistStorage,
	createContextStore,
} from "easy-peasy";
import { LazyStore, LazyStore as TauriStore } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import { flattenObject, unflattenObject } from "../utils";
import { useEffect, useState } from "react";
import posthog from "posthog-js";
import localforage from "localforage";

export type VadSensitivity = "low" | "medium" | "high";

export type AIProviderType =
	| "native-ollama"
	| "openai"
	| "custom"
	| "embedded"
	| "screenpipe-cloud";

export type EmbeddedLLMConfig = {
	enabled: boolean;
	model: string;
	port: number;
};

export enum Shortcut {
	SHOW_SCREENPIPE = "show_screenpipe",
	START_RECORDING = "start_recording",
	STOP_RECORDING = "stop_recording",
}

export type User = {
	id?: string;
	email?: string;
	name?: string;
	image?: string;
	token?: string;
	clerk_id?: string;
	api_key?: string;
	credits?: {
		amount: number;
	};
	stripe_connected?: boolean;
	stripe_account_status?: "active" | "pending";
	github_username?: string;
	bio?: string;
	website?: string;
	contact?: string;
	cloud_subscribed?: boolean;
};

export type AIPreset = {
	id: string;
	maxContextChars: number;
	url: string;
	model: string;
	defaultPreset: boolean;
	prompt: string;
	//provider: AIProviderType;
} & (
	| {
			provider: "openai";
			apiKey: string;
	  }
	| {
			provider: "native-ollama";
	  }
	| {
			provider: "screenpipe-cloud";
	  }
	| {
			provider: "custom";
			apiKey?: string;
	  }
);

export type Settings = {
	openaiApiKey: string;
	deepgramApiKey: string;
	isLoading: boolean;
	aiModel: string;
	installedPipes: Pipe[];
	userId: string;
	customPrompt: string;
	devMode: boolean;
	audioTranscriptionEngine: string;
	ocrEngine: string;
	monitorIds: string[];
	audioDevices: string[];
	usePiiRemoval: boolean;
	restartInterval: number;
	port: number;
	dataDir: string;
	disableAudio: boolean;
	ignoredWindows: string[];
	includedWindows: string[];
	aiProviderType: AIProviderType;
	aiUrl: string;
	aiMaxContextChars: number;
	fps: number;
	vadSensitivity: VadSensitivity;
	analyticsEnabled: boolean;
	audioChunkDuration: number; // new field
	useChineseMirror: boolean; // Add this line
	embeddedLLM: EmbeddedLLMConfig;
	languages: Language[];
	enableBeta: boolean;
	isFirstTimeUser: boolean;
	autoStartEnabled: boolean;
	enableFrameCache: boolean; // Add this line
	enableUiMonitoring: boolean; // Add this line
	platform: string; // Add this line
	disabledShortcuts: Shortcut[];
	user: User;
	showScreenpipeShortcut: string;
	startRecordingShortcut: string;
	stopRecordingShortcut: string;
	startAudioShortcut: string;
	stopAudioShortcut: string;
	pipeShortcuts: Record<string, string>;
	enableRealtimeAudioTranscription: boolean;
	realtimeAudioTranscriptionEngine: string;
	disableVision: boolean;
	useAllMonitors: boolean;
	aiPresets: AIPreset[];
	enableRealtimeVision: boolean;
};

export const DEFAULT_PROMPT = `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things
`;

const DEFAULT_SETTINGS: Settings = {
	aiPresets: [],
	openaiApiKey: "",
	deepgramApiKey: "", // for now we hardcode our key (dw about using it, we have bunch of credits)
	isLoading: false,
	aiModel: "gpt-4o",
	installedPipes: [],
	userId: "",
	customPrompt: `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things
`,
	devMode: false,
	audioTranscriptionEngine: "whisper-large-v3-turbo",
	ocrEngine: "default",
	monitorIds: ["default"],
	audioDevices: ["default"],
	usePiiRemoval: false,
	restartInterval: 0,
	port: 3030,
	dataDir: "default",
	disableAudio: false,
	ignoredWindows: [],
	includedWindows: [],
	aiProviderType: "openai",
	aiUrl: "https://api.openai.com/v1",
	aiMaxContextChars: 512000,
	fps: 0.5,
	vadSensitivity: "high",
	analyticsEnabled: true,
	audioChunkDuration: 30, // default to 10 seconds
	useChineseMirror: false, // Add this line
	languages: [],
	embeddedLLM: {
		enabled: false,
		model: "llama3.2:1b-instruct-q4_K_M",
		port: 11434,
	},
	enableBeta: false,
	isFirstTimeUser: true,
	autoStartEnabled: true,
	enableFrameCache: true, // Add this line
	enableUiMonitoring: false, // Change from true to false
	platform: "unknown", // Add this line
	disabledShortcuts: [],
	user: {},
	showScreenpipeShortcut: "Super+Alt+S",
	startRecordingShortcut: "Super+Alt+U", // Super+Alt+R is used on windows by Xbox Game Bar
	stopRecordingShortcut: "Super+Alt+X",
	startAudioShortcut: "",
	stopAudioShortcut: "",
	pipeShortcuts: {},
	enableRealtimeAudioTranscription: false,
	realtimeAudioTranscriptionEngine: "deepgram",
	disableVision: false,
	useAllMonitors: false,
	enableRealtimeVision: true,
};

const DEFAULT_IGNORED_WINDOWS_IN_ALL_OS = [
	"bit",
	"VPN",
	"Trash",
	"Private",
	"Incognito",
	"Wallpaper",
	"Settings",
	"Keepass",
	"Recorder",
	"Vaults",
	"OBS Studio",
	"screenpipe",
];

const DEFAULT_IGNORED_WINDOWS_PER_OS: Record<string, string[]> = {
	macos: [
		".env",
		"Item-0",
		"App Icon Window",
		"Battery",
		"Shortcuts",
		"WiFi",
		"BentoBox",
		"Clock",
		"Dock",
		"DeepL",
		"Control Center",
	],
	windows: ["Nvidia", "Control Panel", "System Properties"],
	linux: ["Info center", "Discover", "Parted"],
};

// Model definition
export interface StoreModel {
	settings: Settings;
	setSettings: Action<StoreModel, Partial<Settings>>;
	resetSettings: Action<StoreModel>;
	resetSetting: Action<StoreModel, keyof Settings>;
}

// Validate and sanitize settings to prevent corruption
function validateSettings(settings: any): Settings {
	const defaultSettings = createDefaultSettingsObject();
	
	// Ensure all required fields exist with proper types
	const validatedSettings: Settings = {
		...defaultSettings,
		...settings,
	};

	// Validate specific fields that are critical
	if (!Array.isArray(validatedSettings.monitorIds)) {
		validatedSettings.monitorIds = defaultSettings.monitorIds;
	}
	
	if (!Array.isArray(validatedSettings.audioDevices)) {
		validatedSettings.audioDevices = defaultSettings.audioDevices;
	}
	
	if (!Array.isArray(validatedSettings.ignoredWindows)) {
		validatedSettings.ignoredWindows = defaultSettings.ignoredWindows;
	}
	
	if (!Array.isArray(validatedSettings.includedWindows)) {
		validatedSettings.includedWindows = defaultSettings.includedWindows;
	}
	
	if (!Array.isArray(validatedSettings.aiPresets)) {
		validatedSettings.aiPresets = defaultSettings.aiPresets;
	}

	// Validate numeric fields
	if (typeof validatedSettings.fps !== 'number' || validatedSettings.fps < 0) {
		validatedSettings.fps = defaultSettings.fps;
	}
	
	if (typeof validatedSettings.port !== 'number' || validatedSettings.port < 1000) {
		validatedSettings.port = defaultSettings.port;
	}

	return validatedSettings;
}

export function createDefaultSettingsObject(): Settings {
	let defaultSettings = { ...DEFAULT_SETTINGS };
	try {
		const currentPlatform = platform();

		const ocrModel =
			currentPlatform === "macos"
				? "apple-native"
				: currentPlatform === "windows"
					? "windows-native"
					: "tesseract";

		defaultSettings.ocrEngine = ocrModel;
		defaultSettings.fps = currentPlatform === "macos" ? 0.5 : 1;
		defaultSettings.platform = currentPlatform;

		defaultSettings.ignoredWindows = [
			...DEFAULT_IGNORED_WINDOWS_IN_ALL_OS,
			...(DEFAULT_IGNORED_WINDOWS_PER_OS[currentPlatform] ?? []),
		];

		return defaultSettings;
	} catch (e) {
		return DEFAULT_SETTINGS;
	}
}

// Create a singleton store instance
let storePromise: Promise<LazyStore> | null = null;

// Debounce mechanism for saving settings
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 500;

// Track if settings have been loaded from storage at least once
let hasLoadedFromStorage = false;

// Helper function to check if settings are ready to use
export const areSettingsReady = () => hasLoadedFromStorage;

/**
 * @warning Do not change autoSave to true, it causes race conditions
 */
export const getStore = async () => {
	if (!storePromise) {
		storePromise = (async () => {
			const dir = await localDataDir();
			const profilesStore = new TauriStore(`${dir}/openrewind/profiles.bin`, {
				autoSave: false,
			});
			const activeProfile =
				(await profilesStore.get("activeProfile")) || "default";
			const file =
				activeProfile === "default"
					? `store.bin`
					: `store-${activeProfile}.bin`;
			console.log("activeProfile", activeProfile, file);
			return new TauriStore(`${dir}/openrewind/${file}`, {
				autoSave: false,
			});
		})();
	}
	return storePromise;
};

const tauriStorage: PersistStorage = {
	getItem: async (_key: string) => {
		try {
			const tauriStore = await getStore();
			const allKeys = await tauriStore.keys();
			const values: Record<string, any> = {};

			for (const k of allKeys) {
				try {
					values[k] = await tauriStore.get(k);
				} catch (error) {
					console.warn(`Failed to get key ${k}:`, error);
					// Continue with other keys if one fails
				}
			}

			const settings = unflattenObject(values);
			
			// Validate and sanitize the loaded settings
			const validatedSettings = validateSettings(settings);
			
			// Mark that we've successfully loaded from storage
			hasLoadedFromStorage = true;

			return { settings: validatedSettings };
		} catch (error) {
			console.error("Failed to load settings, using defaults:", error);
			// Return default settings if loading fails completely
			return { settings: createDefaultSettingsObject() };
		}
	},
	setItem: async (_key: string, value: any) => {
		const tauriStore = await getStore();

		try {
			delete value.settings.customSettings;
			
			// Validate settings before saving
			const validatedSettings = validateSettings(value.settings);
			const flattenedValue = flattenObject(validatedSettings);

			// Get existing keys to know what to clean up
			const existingKeys = await tauriStore.keys();
			
			// Set new flattened values first
			for (const [key, val] of Object.entries(flattenedValue)) {
				if (!key || !key.length) continue;
				const defaultValue =
					key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[key as keyof Settings] : "";
				await tauriStore.set(key, val === undefined ? defaultValue : val);
			}

			// Only delete keys that are no longer in the new settings
			const newKeys = Object.keys(flattenedValue);
			for (const existingKey of existingKeys) {
				if (!newKeys.includes(existingKey)) {
					await tauriStore.delete(existingKey);
				}
			}

			// Debounce the save operation to prevent race conditions
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}
			
			saveTimeout = setTimeout(async () => {
				try {
					await tauriStore.save();
				} catch (error) {
					console.error("Failed to save store:", error);
				}
			}, SAVE_DEBOUNCE_MS);
		} catch (error) {
			console.error("Failed to save settings:", error);
			// Don't throw to prevent breaking the app, but log the error
		}
	},
	removeItem: async (_key: string) => {
		const tauriStore = await getStore();
		const keys = await tauriStore.keys();
		for (const key of keys) {
			await tauriStore.delete(key);
		}
		await tauriStore.save();
	},
};

export const store = createContextStore<StoreModel>(
	persist(
		{
			settings: createDefaultSettingsObject(),
			setSettings: action((state, payload) => {
				console.log(state, payload);
				state.settings = {
					...state.settings,
					...payload,
				};
			}),
			resetSettings: action((state) => {
				state.settings = createDefaultSettingsObject();
			}),
			resetSetting: action((state, key) => {
				const defaultValue = createDefaultSettingsObject()[key];
				(state.settings as any)[key] = defaultValue;
			}),
		},
		{
			storage: tauriStorage,
			mergeStrategy: "mergeDeep",
		},
	),
);

export function useSettings() {
	const settings = store.useStoreState((state) => state.settings);
	const setSettings = store.useStoreActions((actions) => actions.setSettings);
	const resetSettings = store.useStoreActions(
		(actions) => actions.resetSettings,
	);
	const resetSetting = store.useStoreActions((actions) => actions.resetSetting);

	// Track if settings have been loaded from storage
	const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
	const [loadingError, setLoadingError] = useState<string | null>(null);

	// Initialize settings loading on mount
	useEffect(() => {
		const initializeSettings = async () => {
			try {
				// Add timeout to prevent hanging
				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => reject(new Error("Settings loading timeout")), 5000);
				});

				const loadPromise = (async () => {
					// Force a reload from storage to ensure we have the latest settings
					const store = await getStore();
					const allKeys = await store.keys();
					
					if (allKeys.length > 0) {
						// Settings exist in storage, load them
						const values: Record<string, any> = {};
						for (const k of allKeys) {
							try {
								values[k] = await store.get(k);
							} catch (error) {
								console.warn(`Failed to get key ${k}:`, error);
							}
						}
						
						const loadedSettings = unflattenObject(values);
						const validatedSettings = validateSettings(loadedSettings);
						
						// Only update if the loaded settings are different from current
						if (JSON.stringify(validatedSettings) !== JSON.stringify(settings)) {
							setSettings(validatedSettings);
						}
					} else {
						console.log("No existing settings found, using defaults");
					}
				})();

				await Promise.race([loadPromise, timeoutPromise]);
				
				setIsSettingsLoaded(true);
				setLoadingError(null);
			} catch (error) {
				console.error("Failed to initialize settings:", error);
				setLoadingError(error instanceof Error ? error.message : "Unknown error");
				setIsSettingsLoaded(true); // Still mark as loaded to prevent infinite loading
			}
		};

		// Only initialize if not already loaded
		if (!isSettingsLoaded) {
			initializeSettings();
		}
	}, [isSettingsLoaded, setSettings]);

	useEffect(() => {
		if (settings.user?.id) {
			posthog.identify(settings.user?.id, {
				email: settings.user?.email,
				name: settings.user?.name,
				github_username: settings.user?.github_username,
				website: settings.user?.website,
				contact: settings.user?.contact,
			});
		}
	}, [settings.user?.id]);

	const getDataDir = async () => {
		const homeDirPath = await homeDir();

		if (
			settings.dataDir !== "default" &&
			settings.dataDir &&
			settings.dataDir !== ""
		)
			return settings.dataDir;

		let p = "macos";
		try {
			p = platform();
		} catch (e) {}

		return p === "macos" || p === "linux"
			? `${homeDirPath}/.screenpipe`
			: `${homeDirPath}\\.screenpipe`;
	};

	const loadUser = async (token: string, forceReload = false) => {
		try {
			// try to get from cache first (unless force reload)
			const cacheKey = `user_data_${token}`;
			if (!forceReload) {
				const cached = await localforage.getItem<{
					data: User;
					timestamp: number;
				}>(cacheKey);

				// use cache if less than 30s old
				if (cached && Date.now() - cached.timestamp < 30000) {
					setSettings({
						user: cached.data,
					});
					return;
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
				throw new Error("failed to verify token");
			}

			const data = await response.json();
			const userData = {
				...data.user,
			} as User;

			// if user was not logged in, send posthog event app_login with email
			if (!settings.user?.id) {
				posthog.capture("app_login", {
					email: userData.email,
				});
			}

			// cache the result
			await localforage.setItem(cacheKey, {
				data: userData,
				timestamp: Date.now(),
			});

			setSettings({
				user: userData,
			});
		} catch (err) {
			console.error("failed to load user:", err);
			throw err;
		}
	};

	const reloadStore = async () => {
		const store = await getStore();
		await store.reload();

		const allKeys = await store.keys();
		const values: Record<string, any> = {};

		for (const k of allKeys) {
			values[k] = await store.get(k);
		}

		setSettings(unflattenObject(values));
	};

	return {
		settings,
		updateSettings: setSettings,
		resetSettings,
		reloadStore,
		loadUser,
		resetSetting,
		getDataDir,
		isSettingsLoaded,
		loadingError,
	};
}
