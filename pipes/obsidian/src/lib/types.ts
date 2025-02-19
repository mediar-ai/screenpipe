import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";

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
  vaultPath: string;
  prompt: string;
  screenpipeAppSettings: ScreenpipeAppSettings;
}
