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

export interface AppUsage {
  app: string;
  duration: string;
  percentage: number;
  mainUsage: string;
}

export interface WorkingFile {
  filename: string;
  description: string;
}

export interface DailyReport {
  date: string;
  recordingPeriod: string;
  captureCount: number;
  // 総括
  summary: {
    oneLine: string;           // 一言で今日を表すと
    achievements: string[];     // 達成できたこと
    challenges: string[];       // 課題・困難だったこと
  };
  // 行動分析
  actionAnalysis: {
    patterns: string[];         // 行動パターン（良い/悪い習慣）
    focusTime: string;          // 集中できた時間帯
    distractions: string[];     // 気が散った要因
  };
  // メイン作業
  mainActivities: {
    title: string;
    description: string;
    outcome: string;            // 成果・結果
  }[];
  // 時間配分
  timeAllocation: {
    category: string;
    duration: string;
    percentage: number;
  }[];
  // 知見・メモ
  insights: {
    topic: string;
    points: string[];
  }[];
  // 注意点・警告
  attentionPoints: {
    issue: string;              // 問題点
    risk: string;               // リスク
    suggestion: string;         // 対処法
  }[];
  // 改善点・次のアクション
  improvements: {
    area: string;               // 改善領域
    current: string;            // 現状
    action: string;             // 具体的なアクション
    priority: "high" | "medium" | "low";
  }[];
  workingFiles: WorkingFile[];
  appUsage: AppUsage[];
  tags: string[];
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
