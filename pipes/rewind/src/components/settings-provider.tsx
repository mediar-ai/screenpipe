"use client";

import {
	getScreenpipeAppSettings,
	updateScreenpipeAppSettings,
} from "@/lib/actions/get-screenpipe-app-settings";
import { Settings } from "@screenpipe/js";
import { createContext, ReactNode, useEffect, useState } from "react";

export const SettingsContext = createContext<{
	settings: Partial<Settings> | null;
	loading: boolean;
	updateSettings: (value: Partial<Settings>) => Promise<boolean>;
} | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
	const [settings, setSettings] = useState<Partial<Settings> | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadSettings();
		console.log("fetched");
	}, []);

	const loadSettings = async () => {
		try {
			// Load screenpipe app settings
			const screenpipeSettings = await getScreenpipeAppSettings();

			// Merge everything together
			setSettings({
				...screenpipeSettings,
			});
		} catch (error) {
			console.error("failed to load settings:", error);
		} finally {
			setLoading(false);
		}
	};

	const updateSettings = async (screenpipeAppSettings: Partial<Settings>) => {
		try {
			// Update screenpipe settings if provided
			if (screenpipeAppSettings) {
				await updateScreenpipeAppSettings({
					...settings,
					...screenpipeAppSettings,
				});
			}

			// Update state with everything
			setSettings({
				...screenpipeAppSettings,
			});
			return true;
		} catch (error) {
			console.error("failed to update settings:", error);
			return false;
		}
	};

	return (
		<SettingsContext.Provider value={{ settings, loading, updateSettings }}>
			{children}
		</SettingsContext.Provider>
	);
};
