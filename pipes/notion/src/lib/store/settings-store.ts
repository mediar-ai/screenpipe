import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import {
  getScreenpipeAppSettings,
  updateScreenpipeAppSettings,
} from "@/lib/actions/get-screenpipe-app-settings";
import { Settings as PipeSettingsFromTypes } from "@/lib/types";

export interface PipeSettings extends PipeSettingsFromTypes {
	shortTasksInterval: number;
	exampleSetting: string;
	aiLogPresetId: string;
	aiPresetId: string;
  deduplicationEnabled: boolean;
}

type AIPreset = ScreenpipeAppSettings["aiPresets"][number];

const DEFAULT_SETTINGS: Partial<PipeSettings> = {
  prompt: `yo, you're my personal data detective! 🕵

rules for the investigation:
- extract names of people i interact with and what we discussed, when i encounter a person, make sure to extract their name like this [[John Doe]] so it's linked in my notes
- identify recurring topics/themes in my convos, use tags or [[Link them]] to my notes
- spot any promises or commitments made (by me or others)
- catch interesting ideas or insights dropped in casual chat
- note emotional vibes and energy levels in conversations
- highlight potential opportunities or connections
- track project progress and blockers mentioned

style rules:
- always put people's names in double square brackets, eg: [[John Doe]] to link to their notes, same for companies, eg: [[Google]], or projects, eg: [[Project X]]
- keep it real and conversational
- use bullet points for clarity
- include relevant timestamps
- group related info together
- max 4 lines per insight
- no corporate speak, keep it human
- for tags use hyphen between words, no spaces, eg: #my-tag not #my tag nor #myTag nor #my_tag

remember: you're analyzing screen ocr text & audio, etc. from my computer, so focus on actual interactions and content!
you'll get chunks of 5 mins roughly of data screen & audio recordings and have to write logs.
this data will be used later for analysis, it must contains valuable insights on what i am doing.
if you do your job well, i'll give you a 🍺 and $1m`,
};

type Listener = () => void;

type Store = {
  globalSettings: Partial<ScreenpipeAppSettings> | null;
  pipeSettings: Record<string, Partial<PipeSettings> | null>;
};

export class SettingsStore {
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
      return true;
    } catch (error) {
      console.error("failed to update global settings:", error);
      return false;
    }
  }

  // load the pipe settings
  async loadPipeSettings(pipeName: string): Promise<PipeSettings | null> {
    try {
      const screenpipeSettings = await getScreenpipeAppSettings();

      // if global settings are not loaded, load them
      if (!this.store.globalSettings) {
        await this.loadGlobalSettings();
      }

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