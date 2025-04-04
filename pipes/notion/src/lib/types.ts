import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";

export interface NotionCredentials {
  accessToken: string;
  databaseId: string;
  logsDbId?: string;
  intelligenceDbId: string;
}

export interface NotionAdminSetup {
  adminKey: string;
  workspaceName: string;
}

export interface WorkLog {
  title: string;
  description: string;
  tags: string[];
  startTime: string;
  endTime: string;
}

export interface Contact {
  name: string;
  company?: string;
  lastInteraction: string;
  sentiment: number;
  topics: string[];
  nextSteps: string[];
}

export interface Intelligence {
  contacts: Contact[];
  insights: {
    followUps: string[];
    opportunities: string[];
  };
}

export interface Settings {
  interval: number;
  pageSize: number;
  aiModel: string;
  workspace: string;
  backend: "notion";
  notion: NotionCredentials;
  prompt: string;
  logPrompt: string;
  longTaskPrompt: string;
  screenpipeAppSettings: ScreenpipeAppSettings;
}
