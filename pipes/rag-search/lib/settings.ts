import { pipe } from "@screenpipe/js";

export interface RAGSettings {
  openaiApiKey: string;
  indexingEnabled: boolean;
  maxResults: number;
}

const SETTINGS_KEY = "rag-search";
const DEFAULT_SETTINGS: RAGSettings = {
  openaiApiKey: "",
  indexingEnabled: true,
  maxResults: 10,
};

export async function getSettings(): Promise<RAGSettings> {
  try {
    const settings = await pipe.settings.getCustomSetting(
      SETTINGS_KEY,
      "config"
    ) as RAGSettings | null;
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error("Error loading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<RAGSettings>): Promise<void> {
  try {
    const current = await getSettings();
    await pipe.settings.setCustomSetting(SETTINGS_KEY, "config", {
      ...current,
      ...settings,
    });
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}
