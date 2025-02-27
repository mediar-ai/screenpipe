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
  /** Optional search query text */
  q?: string;

  /** Type of content to search for (default: "all") */
  contentType?: ContentType;

  /** Maximum number of results to return (default: 10) */
  limit?: number;

  /** Number of results to skip (for pagination) */
  offset?: number;

  /** Filter results after this ISO timestamp (e.g. "2023-01-01T00:00:00Z") */
  startTime?: string;

  /** Filter results before this ISO timestamp (e.g. "2023-01-01T00:00:00Z") */
  endTime?: string;

  /** Filter by application name (e.g. "chrome", "vscode") */
  appName?: string;

  /** Filter by window title */
  windowName?: string;

  /** Include base64-encoded screenshot frames in results */
  includeFrames?: boolean;

  /** Filter by minimum text length */
  minLength?: number;

  /** Filter by maximum text length */
  maxLength?: number;

  /** Filter by specific speaker IDs */
  speakerIds?: number[];

  /** Filter by frame name */
  frameName?: string;

  /** Filter by browser URL (for web content) */
  browserUrl?: string;
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
  frameName?: string;
  browserUrl?: string;
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
  frameName?: string;
  browserUrl?: string;
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
  analyticsEnabled: boolean;
  user: User;
  customSettings?: Record<string, any>;
  monitorIds: string[];
  audioDevices: string[];
  audioTranscriptionEngine: string;
  enableRealtimeAudioTranscription: boolean;
  realtimeAudioTranscriptionEngine: string;
  disableVision: boolean;
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

export interface TranscriptionChunk {
  transcription: string;
  timestamp: string; // ISO string
  device: string;
  is_input: boolean;
  is_final: boolean;
  speaker?: string;
}

export interface TranscriptionStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string | null;
  }>;
  metadata?: {
    timestamp: string;
    device: string;
    isInput: boolean;
    speaker?: string;
  };
}

export interface VisionEvent {
  image?: string; // base64 encoded image
  text: string;
  timestamp: string;
  app_name?: string;
  window_name?: string;
  browser_url?: string;
}

export interface VisionStreamResponse {
  type: string;
  data: VisionEvent;
}

export interface EventStreamResponse {
  name: string;
  data: VisionEvent | TranscriptionChunk | any;
}
