import { useState, useEffect } from "react";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import {
	getScreenpipeAppSettings,
	updatePipeSettings,
	updateScreenpipeAppSettings,
} from "../actions/get-screenpipe-app-settings";

export interface PipeSettings {
	aiPresetId: string;
}

type AIPreset = ScreenpipeAppSettings["aiPresets"][number];

const DEFAULT_SETTINGS: Partial<PipeSettings> = {};

type Listener = () => void;
type Store = {
	globalSettings: Partial<ScreenpipeAppSettings> | null;
	pipeSettings: Record<string, Partial<PipeSettings> | null>;
};

class SettingsStore {
	private store: Store = {
		globalSettings: null,
		pipeSettings: {},
	};
	private listeners: Set<Listener> = new Set();

	getStore() {
		return this.store;
	}

	subscribe(listener: Listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	async setGlobalSettings(settings: Partial<ScreenpipeAppSettings> | null) {
		this.store.globalSettings = settings;
		this.notify();
	}

	async setPipeSettings(
		pipeName: string,
		settings: Partial<PipeSettings> | null,
	) {
		this.store.pipeSettings[pipeName] = settings;
		this.notify();
	}

	async loadGlobalSettings() {
		try {
			const screenpipeSettings = await getScreenpipeAppSettings();
			this.setGlobalSettings(screenpipeSettings);
			return screenpipeSettings;
		} catch (error) {
			console.error("failed to load global settings:", error);
			return null;
		}
	}

	async updateGlobalSettings(newSettings: Partial<ScreenpipeAppSettings>) {
		try {
			await updateScreenpipeAppSettings({
				...this.store.globalSettings,
				...newSettings,
			});
			this.setGlobalSettings({
				...this.store.globalSettings,
				...newSettings,
			});
			return true;
		} catch (error) {
			console.error("failed to update global settings:", error);
			return false;
		}
	}

	async loadPipeSettings(pipeName: string) {
		try {
			const screenpipeSettings = await getScreenpipeAppSettings();
			const settings = {
				...DEFAULT_SETTINGS,
				...screenpipeSettings.customSettings?.[pipeName],
			};
			this.setPipeSettings(pipeName, settings);
			return settings;
		} catch (error) {
			console.error("failed to load pipe settings:", error);
			return null;
		}
	}

	async updatePipeSettings(
		pipeName: string,
		newSettings: Partial<PipeSettings>,
	) {
		try {
			await updatePipeSettings(pipeName, newSettings);
			this.setPipeSettings(pipeName, {
				...this.store.pipeSettings[pipeName],
				...newSettings,
			});
			return true;
		} catch (error) {
			console.error("failed to update pipe settings:", error);
			return false;
		}
	}

	getPreset(
		pipeName: string,
		key: keyof PipeSettings = "aiPresetId",
	): (AIPreset & { apiKey: string }) | undefined {
		try {
			const presetId = this.store.pipeSettings[pipeName]?.[key];
			const screenpipeSettings = this.store.globalSettings;

			let preset: AIPreset | undefined;

			if (presetId) {
				preset = screenpipeSettings?.aiPresets?.find(
					(preset) => preset.id === presetId,
				);
			}

			if (!preset) {
				preset = screenpipeSettings?.aiPresets?.find(
					(preset) => preset.defaultPreset,
				);
			}

			if (!preset) {
				return undefined;
			}

			// Handle different provider types that may have apiKey
			const apiKey =
				"provider" in preset && "apiKey" in preset
					? (preset.apiKey as string) || ""
					: "";

			return {
				id: preset.id,
				maxContextChars: preset.maxContextChars,
				url: preset.url,
				model: preset.model,
				defaultPreset: preset.defaultPreset,
				prompt: preset.prompt,
				provider: preset.provider,
				apiKey,
			};
		} catch (error) {
			console.error("failed to get preset:", error);
			return undefined;
		}
	}
}

export const settingsStore = new SettingsStore();

export function usePipeSettings(pipeName: string) {
	const [settings, setSettings] = useState<Partial<PipeSettings> | null>(
		settingsStore.getStore().pipeSettings[pipeName] || null,
	);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadSettings = async () => {
			setLoading(true);
			await settingsStore.loadPipeSettings(pipeName);
			setLoading(false);
		};

		loadSettings();

		const unsubscribe = settingsStore.subscribe(() => {
			setSettings(settingsStore.getStore().pipeSettings[pipeName] || null);
		});

		return () => {
			unsubscribe();
		};
	}, [pipeName]);

	const updateSettings = async (newSettings: Partial<PipeSettings>) => {
		return settingsStore.updatePipeSettings(pipeName, newSettings);
	};

	const getPreset = (key: keyof PipeSettings = "aiPresetId") => {
		return settingsStore.getPreset(pipeName, key);
	};

	return { settings, updateSettings, loading, getPreset };
}

export function useSettings() {
	const [settings, setSettings] =
		useState<Partial<ScreenpipeAppSettings> | null>(
			settingsStore.getStore().globalSettings,
		);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadSettings = async () => {
			setLoading(true);
			await settingsStore.loadGlobalSettings();
			setLoading(false);
		};

		loadSettings();

		const unsubscribe = settingsStore.subscribe(() => {
			setSettings(settingsStore.getStore().globalSettings);
		});

		return () => {
			unsubscribe();
		};
	}, []);

	const updateSettings = async (
		newSettings: Partial<ScreenpipeAppSettings>,
	) => {
		return settingsStore.updateGlobalSettings(newSettings);
	};

	return { settings, updateSettings, loading };
}
