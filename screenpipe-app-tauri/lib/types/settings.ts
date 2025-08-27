import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Pipe } from "../hooks/use-pipes";
import { Language } from "@/lib/language";

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
	realtimeAudioTranscriptionEngine: string;
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
	aiUrl: string;
	aiMaxContextChars: number;
	fps: number;
	vadSensitivity: VadSensitivity;
	analyticsEnabled: boolean;
	audioChunkDuration: number;
	user: User;
	embeddedLLM: EmbeddedLLMConfig;
	languages: Language[];
	aiPresets: AIPreset[];
	enableAiAnalysis: boolean;
	useChineseMirror: boolean;
	enableRealtimeVision: boolean;
	enableUiMonitoring: boolean;
	disableScreenshots: boolean;
	enableFrameCache: boolean;
	enableAudioTranscription: boolean;
	enableRealtimeAudioTranscription: boolean;
	isFirstTimeUser: boolean;
	showInstalledPipesOnly: boolean;
	autoUpdatePipes: boolean;
	aiProviderType: AIProviderType;
	autoStartEnabled: boolean;
	disableVision: boolean;
	useAllMonitors: boolean;
	disabledShortcuts: Shortcut[];
	showScreenpipeShortcut: string;
	startRecordingShortcut: string;
	stopRecordingShortcut: string;
	startAudioShortcut: string;
	stopAudioShortcut: string;
	pipeShortcuts: Record<string, any>;
};

export const createDefaultSettingsObject = (): Settings => {
	return {
		openaiApiKey: "",
		deepgramApiKey: "",
		isLoading: false,
		aiModel: "gpt-4o-mini",
		installedPipes: [],
		userId: "",
		customPrompt: "",
		devMode: false,
		audioTranscriptionEngine: "whisper-large-v3",
		realtimeAudioTranscriptionEngine: "whisper-large-v3",
		ocrEngine: "default",
		monitorIds: [],
		audioDevices: [],
		usePiiRemoval: false,
		restartInterval: 0,
		port: 3030,
		dataDir: "default",
		disableAudio: false,
		ignoredWindows: [],
		includedWindows: [],
		aiUrl: "",
		aiMaxContextChars: 128000,
		fps: 0.2,
		vadSensitivity: "high",
		analyticsEnabled: true,
		audioChunkDuration: 30,
		user: {},
		embeddedLLM: {
			enabled: false,
			model: "llama3.2:3b-instruct-q4_K_M",
			port: 11438,
		},
		languages: [Language.english],
		aiPresets: [],
		enableAiAnalysis: false,
		useChineseMirror: false,
		enableRealtimeVision: false,
		enableUiMonitoring: false,
		disableScreenshots: false,
		enableFrameCache: true,
		enableAudioTranscription: true,
		enableRealtimeAudioTranscription: false,
		isFirstTimeUser: true,
		showInstalledPipesOnly: false,
		autoUpdatePipes: false,
		aiProviderType: "openai",
		autoStartEnabled: false,
		disableVision: false,
		useAllMonitors: false,
		disabledShortcuts: [],
		showScreenpipeShortcut: "Super+Alt+S",
		startRecordingShortcut: "Super+Alt+R",
		stopRecordingShortcut: "Super+Alt+T",
		startAudioShortcut: "Super+Alt+A",
		stopAudioShortcut: "Super+Alt+Z",
		pipeShortcuts: {},
	};
};

export const DEFAULT_PROMPT = `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things
`;

export const DEFAULT_SETTINGS: Settings = createDefaultSettingsObject();