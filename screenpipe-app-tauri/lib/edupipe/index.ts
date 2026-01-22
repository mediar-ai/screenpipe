// EduPipe - Educational AI Companion
// Main module exports

// Types
export * from "./types";

// Canvas API
export { CanvasAPI, CanvasAPIError, createCanvasAPI, getCanvasOAuthUrl, exchangeCanvasOAuthCode } from "./canvas-api";

// Canvas Sync Service
export {
  CanvasSyncService,
  getCanvasData,
  getSyncState,
  setCanvasData,
  setSyncState,
  isSyncNeeded,
} from "./canvas-sync";
export type { SyncState, CanvasData, SyncProgressCallback } from "./canvas-sync";

// React Hooks
export { EduPipeSettingsProvider, useEduPipeSettings, getEduPipeStore } from "./use-edupipe-settings";
export { useCanvas } from "./use-canvas";
