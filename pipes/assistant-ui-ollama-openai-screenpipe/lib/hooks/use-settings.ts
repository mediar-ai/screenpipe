import { useState, useEffect } from "react";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import {
	getScreenpipeAppSettings,
	updateScreenpipeAppSettings,
} from "@/lib/actions/get-screenpipe-app-settings";

export interface PipeSettings {
	exampleSetting: string;
	aiLogPresetId: string;
	aiPresetId: string;
}

type AIPreset = ScreenpipeAppSettings["aiPresets"][number];

export const DEFAULT_SETTINGS: Partial<PipeSettings> = {
	exampleSetting: "default value",
};

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

	// get the store
	getStore() {
		return this.store;
	}

	// subscribe to changes in the store
	subscribe(listener: Listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// notify the listeners that the store has changed
	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	// set the global settings
	async setGlobalSettings(settings: Partial<ScreenpipeAppSettings> | null) {
		this.store.globalSettings = settings;
		this.notify();
	}

	// set the pipe settings
	async setPipeSettings(
		pipeName: string,
		settings: Partial<PipeSettings> | null,
	) {
		this.store.pipeSettings[pipeName] = settings;

		this.notify();
	}

	// load the global settings
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

	// update the global settings
	async updateGlobalSettings(newSettings: Partial<ScreenpipeAppSettings>) {
		try {
			const mightBeUpdated = await getScreenpipeAppSettings();

			const updatedSettings = {
				...mightBeUpdated,
				...newSettings,
			};

			await updateScreenpipeAppSettings(updatedSettings);
			this.setGlobalSettings(updatedSettings);
			this.notify();
			return true;
		} catch (error) {
			console.error("failed to update global settings:", error);
			return false;
		}
	}

	// load the pipe settings
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

	// update the pipe settings
	async updatePipeSettings(
		pipeName: string,
		newSettings: Partial<PipeSettings>,
	) {
		try {
			// get the current settings
			const mightBeUpdated = await getScreenpipeAppSettings();

			const updatedSettings = {
				...mightBeUpdated,
				customSettings: {
					...(mightBeUpdated.customSettings || {}),
					[pipeName]: {
						...(mightBeUpdated.customSettings?.[pipeName] || {}),
						...newSettings,
					},
				},
			};

			await updateScreenpipeAppSettings(updatedSettings);
			this.setGlobalSettings(updatedSettings);
			this.setPipeSettings(pipeName, {
				...(mightBeUpdated.customSettings?.[pipeName] || {}),
				...newSettings,
			});
			return true;
		} catch (error) {
			console.error("failed to update pipe settings:", error);
			return false;
		}
	}

	// get the preset
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
				"provider" in preset && preset.provider === "screenpipe-cloud"
					? screenpipeSettings?.user?.token || ""
					: "provider" in preset && "apiKey" in preset
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
