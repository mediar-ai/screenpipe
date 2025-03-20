"use server";

import { pipe } from "@screenpipe/js";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";

export async function getScreenpipeAppSettings() {
  return await pipe.settings.getAll();
}

export async function updateScreenpipeAppSettings(
  newSettings: Partial<ScreenpipeAppSettings>
) {
  return await pipe.settings.update(newSettings);
}
