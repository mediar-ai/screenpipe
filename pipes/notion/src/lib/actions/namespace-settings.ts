"use server";

import { pipe } from "@screenpipe/js";
import { Settings } from "../types";

export async function getNotionSettings() {
	return (await pipe.settings.getAll())["customSettings"]![
		"notion"
	] as Partial<Settings>;
}

export async function updateNotionSettings(newSettings: Partial<Settings>) {
	return await pipe.settings.updateNamespaceSettings("notion", newSettings);
}
