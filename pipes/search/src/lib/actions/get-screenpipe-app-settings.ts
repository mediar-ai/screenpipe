"use server";

import { pipe } from "@screenpipe/js";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import { type PipeSettings } from "@/lib/hooks/use-settings";

export async function getScreenpipeAppSettings() {
	return await pipe.settings.getAll();
}

export async function updateScreenpipeAppSettings(
	newSettings: Partial<ScreenpipeAppSettings>,
) {
	return await pipe.settings.update(newSettings);
}

export async function updatePipeSettings(
	pipeName: string,
	newSettings: Partial<PipeSettings>,
) {
	return await pipe.settings.updateNamespaceSettings(pipeName, newSettings);
}
