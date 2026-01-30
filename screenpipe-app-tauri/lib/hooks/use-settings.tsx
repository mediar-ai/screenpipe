import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Store } from "@tauri-apps/plugin-store";
import { localDataDir } from "@tauri-apps/api/path";
import React, { createContext, useContext, useEffect, useState } from "react";
import posthog from "posthog-js";
import localforage from "localforage";
import { User } from "../utils/tauri";
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

export type UpdateChannel = "stable" | "beta";

// Chat history types
export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

export interface ChatConversation {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
}

export interface ChatHistoryStore {
	conversations: ChatConversation[];
	activeConversationId: string | null;
	historyEnabled: boolean;
}

// Extend SettingsStore with fields added before Rust types are regenerated
export type Settings = SettingsStore & {
	deviceId?: string;
	updateChannel?: UpdateChannel;
	chatHistory?: ChatHistoryStore;
	ignoredUrls?: string[];
}

export const DEFAULT_PROMPT = `Rules:
- Videos: use inline code \`/path/to/video.mp4\` (not links or multiline blocks)
- Diagrams: use \`\`\`mermaid blocks for visual summaries (flowchart, gantt, mindmap, graph)
- Activity summaries: gantt charts with apps/duration
- Workflows: flowcharts showing steps taken
- Knowledge sources: graph diagrams showing where info came from (apps, times, conversations)
- Meetings: extract speakers, decisions, action items
- Stay factual, use only provided data
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

// Default free AI preset that works without login
// Note: screenpipe-cloud provider doesn't require apiKey
const DEFAULT_FREE_PRESET: AIPreset = {
	id: "screenpipe-free",
	provider: "screenpipe-cloud",
	url: "https://api.screenpi.pe/v1",
	model: "claude-haiku-4-5@20251001",
	maxContextChars: 128000,
	defaultPreset: true,
	prompt: DEFAULT_PROMPT,
};

// Second default preset with Gemini Flash 3 (also free, supports web search)
const DEFAULT_GEMINI_PRESET: AIPreset = {
	id: "gemini-flash",
	provider: "screenpipe-cloud",
	url: "https://api.screenpi.pe/v1",
	model: "gemini-3-flash",
	maxContextChars: 128000,
	defaultPreset: false,
	prompt: DEFAULT_PROMPT,
};

let DEFAULT_SETTINGS: Settings = {
			aiPresets: [DEFAULT_FREE_PRESET as any, DEFAULT_GEMINI_PRESET as any],
			deviceId: crypto.randomUUID(),
			deepgramApiKey: "",
			isLoading: false,
			userId: "",
			analyticsId: "",
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
			ignoredUrls: [],

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
		updateChannel: "stable",
			isFirstTimeUser: true,
			autoStartEnabled: true,
			enableFrameCache: true,
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
			showScreenpipeShortcut: "Control+Super+S",
			startRecordingShortcut: "Super+Alt+U",
			stopRecordingShortcut: "Super+Alt+X",
			startAudioShortcut: "",
			stopAudioShortcut: "",
			showChatShortcut: "Control+Super+L",
			enableRealtimeAudioTranscription: false,
			realtimeAudioTranscriptionEngine: "deepgram",
			disableVision: false,
			useAllMonitors: true,
			enableRealtimeVision: true,
			showShortcutOverlay: true,
			chatHistory: {
				conversations: [],
				activeConversationId: null,
				historyEnabled: true,
			},
		};

export function createDefaultSettingsObject(): Settings {
	try {
		const p = platform();
		DEFAULT_SETTINGS.platform = p;
		DEFAULT_SETTINGS.disabledShortcuts = DEFAULT_IGNORED_WINDOWS_IN_ALL_OS;
		DEFAULT_SETTINGS.disabledShortcuts.push(...(DEFAULT_IGNORED_WINDOWS_PER_OS[p] ?? []));
		DEFAULT_SETTINGS.ocrEngine = p === "macos" ? "apple-native" : p === "windows" ? "windows-native" : "tesseract";
		DEFAULT_SETTINGS.fps = p === "macos" ? 0.5 : 1;
		DEFAULT_SETTINGS.showScreenpipeShortcut = p === "windows" ? "Alt+S" : "Control+Super+S";
		DEFAULT_SETTINGS.showChatShortcut = p === "windows" ? "Alt+L" : "Control+Super+L";

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
		_store = Store.load(`${dir}/screenpipe/store.bin`, {
			autoSave: false,
			defaults: {},
		});
	}
	return _store;
};

// Store utilities similar to Cap's implementation
function createSettingsStore() {
	const get = async (): Promise<Settings> => {
		const store = await getStore();
		const settings = await store.get<Settings>("settings");
		if (!settings) {
			return createDefaultSettingsObject();
		}

		// Migration: Ensure existing users have deviceId for free tier tracking
		let needsUpdate = false;
		if (!settings.deviceId) {
			settings.deviceId = crypto.randomUUID();
			needsUpdate = true;
		}

		// Migration: Add default free preset if user has no presets
		if (!settings.aiPresets || settings.aiPresets.length === 0) {
			settings.aiPresets = [DEFAULT_FREE_PRESET as any, DEFAULT_GEMINI_PRESET as any];
			needsUpdate = true;
		}

		// Migration: Add Gemini preset for existing users who don't have it
		const hasGeminiPreset = settings.aiPresets?.some(
			(p: any) => p.id === "gemini-flash" || p.model?.includes("gemini")
		);
		if (settings.aiPresets && settings.aiPresets.length > 0 && !hasGeminiPreset) {
			settings.aiPresets = [...settings.aiPresets, DEFAULT_GEMINI_PRESET as any];
			needsUpdate = true;
		}

		// Migration: Add chat history for existing users
		if (!settings.chatHistory) {
			settings.chatHistory = {
				conversations: [],
				activeConversationId: null,
				historyEnabled: true,
			};
			needsUpdate = true;
		}

		// Save migrations if needed
		if (needsUpdate) {
			await store.set("settings", settings);
			await store.save();
		}

		return settings;
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

	// Identify with persistent analyticsId for consistent tracking across frontend/backend
	useEffect(() => {
		if (settings.analyticsId) {
			posthog.identify(settings.analyticsId, {
				email: settings.user?.email,
				name: settings.user?.name,
				user_id: settings.user?.id,
				github_username: settings.user?.github_username,
				website: settings.user?.website,
				contact: settings.user?.contact,
			});
		}
	}, [settings.analyticsId, settings.user?.id]);

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

		return `${homeDirPath}/.screenpipe`;
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
