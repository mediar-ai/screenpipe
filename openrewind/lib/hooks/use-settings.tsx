import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Store } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import React, { createContext, useContext, useEffect, useState } from "react";
import posthog from "posthog-js";
import localforage from "localforage";
import { User } from "../utils/tauri";
import { Pipe } from "./use-pipes";
import { Language } from "@/lib/language";
import { SettingsStore } from "../utils/tauri";
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

export type AIPreset = {
	id: string;
	maxContextChars: number;
	url: string;
	model: string;
	defaultPreset: boolean;
	prompt: string;
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

export type Settings = SettingsStore

export const DEFAULT_PROMPT = `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things
`;

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

let DEFAULT_SETTINGS: Settings = {
			aiPresets: [],
			deepgramApiKey: "",
			isLoading: false,
			installedPipes: [],
			userId: "",
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
			ignoredWindows: [
			],
			includedWindows: [],
		
			fps: 0.5,
			vadSensitivity: "high",
			analyticsEnabled: true,
			audioChunkDuration: 30,
			useChineseMirror: false,
			languages: [],
			embeddedLLM: {
				enabled: false,
				model: "llama3.2:1b-instruct-q4_K_M",
				port: 11434,
			},
			enableBeta: false,
			isFirstTimeUser: true,
			autoStartEnabled: true,
			enableFrameCache: true,
			enableUiMonitoring: false,
			platform: "unknown",
			disabledShortcuts: [],
			user: {
				id: null,
				name: null,
				email: null,
				image: null,
				token: null,
				clerk_id: null,
				api_key: null,
				credits: null,
				stripe_connected: null,
				stripe_account_status: null,
				github_username: null,
				bio: null,
				website: null,
				contact: null,
				cloud_subscribed: null
			},
			showOpenrewindShortcut: "Super+Alt+S",
			startRecordingShortcut: "Super+Alt+U",
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

export function createDefaultSettingsObject(): Settings {
	try {
		const p = platform();
		DEFAULT_SETTINGS.platform = p;
		DEFAULT_SETTINGS.disabledShortcuts = DEFAULT_IGNORED_WINDOWS_IN_ALL_OS;
		DEFAULT_SETTINGS.disabledShortcuts.push(...(DEFAULT_IGNORED_WINDOWS_PER_OS[p] ?? []));
		DEFAULT_SETTINGS.ocrEngine = p === "macos" ? "apple-native" : p === "windows" ? "windows-native" : "tesseract";
		DEFAULT_SETTINGS.fps = p === "macos" ? 0.5 : 1;

		return DEFAULT_SETTINGS;
	} catch (e) {
		// Fallback if platform detection fails
		return DEFAULT_SETTINGS;
	}
}

// Store singleton
let _store: Promise<Store> | undefined;

export const getStore = async () => {
	if (!_store) {
		const dir = await localDataDir();
		_store = Store.load(`${dir}/openrewind/store.bin`, {
			autoSave: false,
		});
	}
	return _store;
};

// Store utilities similar to Cap's implementation
function createSettingsStore() {
	const get = async (): Promise<Settings> => {
		const store = await getStore();
		const settings = await store.get<Settings>("settings");
		return settings || createDefaultSettingsObject();
	};

	const set = async (value: Partial<Settings>) => {
		const store = await getStore();
		const current = await get();
		const newSettings = { ...current, ...value };
		await store.set("settings", newSettings);
		await store.save();
	};

	const reset = async () => {
		const store = await getStore();
		await store.set("settings", createDefaultSettingsObject());
		await store.save();
	};

	const resetSetting = async <K extends keyof Settings>(key: K) => {
		const current = await get();
		const defaultValue = createDefaultSettingsObject()[key];
		await set({ [key]: defaultValue } as Partial<Settings>);
	};

	const listen = (callback: (settings: Settings) => void) => {
		return getStore().then((store) => {
			return store.onKeyChange("settings", (newValue: Settings | null | undefined) => {
				callback(newValue || createDefaultSettingsObject());
			});
		});
	};

	return {
		get,
		set,
		reset,
		resetSetting,
		listen,
	};
}

const settingsStore = createSettingsStore();

// Context for React
interface SettingsContextType {
	settings: Settings;
	updateSettings: (updates: Partial<Settings>) => Promise<void>;
	resetSettings: () => Promise<void>;
	resetSetting: <K extends keyof Settings>(key: K) => Promise<void>;
	reloadStore: () => Promise<void>;
	loadUser: (token: string, forceReload?: boolean) => Promise<void>;
	getDataDir: () => Promise<string>;
	isSettingsLoaded: boolean;
	loadingError: string | null;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [settings, setSettings] = useState<Settings>(createDefaultSettingsObject());
	const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
	const [loadingError, setLoadingError] = useState<string | null>(null);

	// Load settings on mount
	useEffect(() => {
		const loadSettings = async () => {
			try {
				const loadedSettings = await settingsStore.get();
				setSettings(loadedSettings);
				setIsSettingsLoaded(true);
				setLoadingError(null);
			} catch (error) {
				console.error("Failed to load settings:", error);
				setLoadingError(error instanceof Error ? error.message : "Unknown error");
				setIsSettingsLoaded(true);
			}
		};

		loadSettings();

		// Listen for changes
		const unsubscribe = settingsStore.listen((newSettings) => {
			setSettings(newSettings);
		});

		return () => {
			unsubscribe.then((unsub) => unsub());
		};
	}, []);

	// Track user changes for posthog
	useEffect(() => {
		if (settings.user && settings.user.id) {
			posthog.identify(settings.user.id, {
				email: settings.user.email,
				name: settings.user.name,
				github_username: settings.user.github_username,
				website: settings.user.website,
				contact: settings.user.contact,
			});
		}
	}, [settings.user?.id]);

	const updateSettings = async (updates: Partial<Settings>) => {
		await settingsStore.set(updates);
		// Settings will be updated via the listener
	};

	const resetSettings = async () => {
		await settingsStore.reset();
		// Settings will be updated via the listener
	};

	const resetSetting = async <K extends keyof Settings>(key: K) => {
		await settingsStore.resetSetting(key);
		// Settings will be updated via the listener
	};

	const reloadStore = async () => {
		const freshSettings = await settingsStore.get();
		setSettings(freshSettings);
	};

	const getDataDir = async () => {
		const homeDirPath = await homeDir();

		if (
			settings.dataDir !== "default" &&
			settings.dataDir &&
			settings.dataDir !== ""
		)
			return settings.dataDir;

		return `${homeDirPath}/.openrewind`;
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
					await updateSettings({ user: cached.data });
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
				token
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

			await updateSettings({ user: userData });
		} catch (err) {
			console.error("failed to load user:", err);
			throw err;
		}
	};

	const value: SettingsContextType = {
		settings,
		updateSettings,
		resetSettings,
		resetSetting,
		reloadStore,
		loadUser,
		getDataDir,
		isSettingsLoaded,
		loadingError,
	};

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
};

export function useSettings(): SettingsContextType {
	const context = useContext(SettingsContext);
	if (context === undefined) {
		throw new Error("useSettings must be used within a SettingsProvider");
	}
	return context;
}
