// @screenpipe/js/index.d.ts

declare module '@screenpipe/js' {
    // Core types
    export interface PipeConfig {
      [key: string]: any;
    }
  
    export interface NotificationOptions {
      title: string;
      body: string;
      actions?: NotificationAction[];
      timeout?: number;
      persistent?: boolean;
    }
  
    export interface NotificationAction {
      id: string;
      label: string;
      callback?: () => Promise<void>;
    }
  
    export type ContentType = 
      | "all"
      | "ocr"
      | "audio"
      | "ui"
      | "audio+ui"
      | "ocr+ui"
      | "audio+ocr";
  
    // Query and Response types
    export interface ScreenpipeQueryParams {
      q?: string;
      contentType?: ContentType;
      limit?: number;
      offset?: number;
      startTime?: string;
      endTime?: string;
      appName?: string;
      windowName?: string;
      includeFrames?: boolean;
      minLength?: number;
      maxLength?: number;
      speakerIds?: number[];
    }
  
    export interface OCRContent {
      frameId: number;
      text: string;
      timestamp: string;
      filePath: string;
      offsetIndex: number;
      appName: string;
      windowName: string;
      tags: string[];
      frame?: string;
    }
  
    export interface AudioContent {
      chunkId: number;
      transcription: string;
      timestamp: string;
      filePath: string;
      offsetIndex: number;
      tags: string[];
      deviceName: string;
      deviceType: string;
      speaker?: Speaker;
    }
  
    export interface UiContent {
      id: number;
      text: string;
      timestamp: string;
      appName: string;
      windowName: string;
      initialTraversalAt?: string;
      filePath: string;
      offsetIndex: number;
    }
  
    export interface Speaker {
      id: number;
      name?: string;
      metadata?: string;
    }
  
    export type ContentItem =
      | { type: "OCR"; content: OCRContent }
      | { type: "Audio"; content: AudioContent }
      | { type: "UI"; content: UiContent };
  
    export interface PaginationInfo {
      limit: number;
      offset: number;
      total: number;
    }
  
    export interface ScreenpipeResponse {
      data: ContentItem[];
      pagination: PaginationInfo;
    }
  
    // Settings types
    export type VadSensitivity = "low" | "medium" | "high";
  
    export type AIProviderType =
      | "native-ollama"
      | "openai"
      | "custom"
      | "embedded"
      | "screenpipe-cloud";
  
    export interface EmbeddedLLMConfig {
      enabled: boolean;
      model: string;
      port: number;
    }
  
    export interface Settings {
      openaiApiKey: string;
      deepgramApiKey: string;
      aiModel: string;
      aiUrl: string;
      customPrompt: string;
      port: number;
      dataDir: string;
      disableAudio: boolean;
      ignoredWindows: string[];
      includedWindows: string[];
      aiProviderType: AIProviderType;
      embeddedLLM: EmbeddedLLMConfig;
      enableFrameCache: boolean;
      enableUiMonitoring: boolean;
      aiMaxContextChars: number;
    }
  
    // Inbox types
    export interface InboxMessage {
      title: string;
      body: string;
      actions?: InboxMessageAction[];
    }
  
    export interface InboxMessageAction {
      label: string;
      action: string;
      callback: () => Promise<void>;
    }
  
    // Input control types
    export type InputAction =
      | { type: "WriteText"; data: string }
      | { type: "KeyPress"; data: string }
      | { type: "MouseMove"; data: { x: number; y: number } }
      | { type: "MouseClick"; data: "left" | "right" | "middle" };
  
    // Settings Manager class
    export class SettingsManager {
      get<K extends keyof Settings>(key: K): Promise<Settings[K]>;
      set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
      getAll(): Promise<Settings>;
      update(newSettings: Partial<Settings>): Promise<void>;
      reset(): Promise<void>;
      resetKey<K extends keyof Settings>(key: K): Promise<void>;
    }
  
    // Inbox Manager class
    export class InboxManager {
      send(message: InboxMessage): Promise<boolean>;
    }
  
    // Main API object
    export const pipe: {
      sendDesktopNotification: (options: NotificationOptions) => Promise<boolean>;
      loadPipeConfig: () => PipeConfig;
      queryScreenpipe: (params: ScreenpipeQueryParams) => Promise<ScreenpipeResponse | null>;
      inbox: InboxManager;
      scheduler: {
        task: (name: string) => {
          every: (interval: string | number) => {
            at: (time: string) => {
              do: (handler: () => Promise<void>) => void;
            };
            do: (handler: () => Promise<void>) => void;
          };
        };
        start: () => void;
        stop: () => void;
      };
      input: {
        type: (text: string) => Promise<boolean>;
        press: (key: string) => Promise<boolean>;
        moveMouse: (x: number, y: number) => Promise<boolean>;
        click: (button: "left" | "right" | "middle") => Promise<boolean>;
      };
      settings: SettingsManager;
    };
  
    // Main functions
    export function sendDesktopNotification(options: NotificationOptions): Promise<boolean>;
    export function loadPipeConfig(): PipeConfig;
    export function queryScreenpipe(params: ScreenpipeQueryParams): Promise<ScreenpipeResponse | null>;
}
