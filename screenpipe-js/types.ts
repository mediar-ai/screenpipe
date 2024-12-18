// types.ts

/**
 * Types of content that can be queried in Screenpipe.
 */
export type ContentType =
  | "all"
  | "ocr"
  | "audio"
  | "ui"
  | "audio+ui"
  | "ocr+ui"
  | "audio+ocr";

/**
 * Parameters for querying Screenpipe.
 */
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

/**
 * Structure of OCR (Optical Character Recognition) content.
 */
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

/**
 * Structure of audio content.
 */
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
  startTime?: number;
  endTime?: number;
}

/**
 * Structure of UI content.
 */
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

/**
 * Speaker information
 */
export interface Speaker {
  id: number;
  name?: string;
  metadata?: string;
}

/**
 * Union type for different types of content items.
 */
export type ContentItem =
  | { type: "OCR"; content: OCRContent }
  | { type: "Audio"; content: AudioContent }
  | { type: "UI"; content: UiContent };

/**
 * Pagination information for search results.
 */
export interface PaginationInfo {
  limit: number;
  offset: number;
  total: number;
}

/**
 * Structure of the response from a Screenpipe query.
 */
export interface ScreenpipeResponse {
  data: ContentItem[];
  pagination: PaginationInfo;
}

/**
 * Input control action types
 */
export type InputAction =
  | { type: "WriteText"; data: string }
  | { type: "KeyPress"; data: string }
  | { type: "MouseMove"; data: { x: number; y: number } }
  | { type: "MouseClick"; data: "left" | "right" | "middle" };

/**
 * Response from input control operations
 */
export interface InputControlResponse {
  success: boolean;
}

/**
 * Notification options
 */
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

/**
 * Inbox message structure
 */
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

export interface ActionResponse {
  action: string;
}

/**
 * Settings types
 */
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

export interface User {
  id?: string;
  email?: string;
  name?: string;
  image?: string;
  token?: string;
  clerk_id?: string;
  credits?: {
    amount: number;
  };
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
  user: User;
}

/**
 * Pipe configuration types
 */
export interface PipeConfig {
  [key: string]: any;
}

export interface ParsedConfig<T = unknown> {
  fields: {
    name: string;
    value?: T;
    default?: T;
  }[];
}
