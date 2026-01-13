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
  prompt: `あなたは私の作業日報を作成するアシスタントです。

## 分析の重点

1. **メイン作業の特定**
   - 最も時間をかけた活動を3-5項目抽出
   - 具体的なプロジェクト名、ツール名を含める
   - 成果や進捗を明記

2. **知見・メモの抽出**
   - リサーチで発見した重要な情報
   - ミーティングでの気づきや決定事項
   - 技術的な学びやTips
   - 処理中・検討中の事項

3. **時間配分の可視化**
   - カテゴリ別の作業時間を推定
   - 開発、リサーチ、ミーティング、ドキュメント作成など

4. **作業ファイルの追跡**
   - 編集・閲覧したファイル名
   - 作業中のドキュメントやコード

## スタイルルール

- 人名は [[山田太郎]] 形式でリンク化
- 会社名・プロジェクト名も [[リンク]] 形式
- タグは #カテゴリ 形式
- 簡潔だが具体的に
- 日本語で出力`,
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