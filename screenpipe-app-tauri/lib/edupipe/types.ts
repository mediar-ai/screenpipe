// EduPipe - Educational AI Companion Types

// Canvas LMS Integration Types
export interface CanvasConfig {
  domain: string; // e.g., "canvas.university.edu"
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: string;
  userId?: number;
  connected: boolean;
  lastSync?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  code: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  enrollmentType: "student" | "teacher" | "observer";
  imageUrl?: string;
  syllabusBody?: string;
  isActive: boolean;
  progress?: number; // Calculated from completed assignments
}

export interface CanvasAssignment {
  id: number;
  courseId: number;
  name: string;
  description?: string;
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  pointsPossible?: number;
  submissionTypes: string[];
  rubric?: CanvasRubric;
  submissionStatus: "submitted" | "pending" | "missing" | "late";
  score?: number;
  grade?: string;
  gradedAt?: string;
  feedbackComment?: string;
  url: string;
}

export interface CanvasRubric {
  id: number;
  criteria: Array<{
    id: string;
    description: string;
    points: number;
    ratings: Array<{
      description: string;
      points: number;
    }>;
  }>;
}

export interface CanvasFile {
  id: number;
  courseId: number;
  displayName: string;
  filename: string;
  contentType: string;
  url: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  localPath?: string; // Path to downloaded file
  indexed: boolean;
  indexedAt?: string;
}

export interface CanvasGrade {
  courseId: number;
  courseName: string;
  currentScore?: number;
  finalScore?: number;
  currentGrade?: string;
  finalGrade?: string;
}

export interface CanvasAnnouncement {
  id: number;
  courseId: number;
  title: string;
  message: string;
  postedAt: string;
  author: string;
}

// Student Profile Types
export type StudentPersona =
  | "undergraduate"
  | "graduate"
  | "researcher"
  | "lifelong-learner"
  | "professional";

export interface LearningGoal {
  id: string;
  title: string;
  description?: string;
  targetDate?: string;
  progress: number;
  relatedCourses: number[];
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  startTime: string;
  endTime?: string;
  courseId?: number;
  assignmentId?: number;
  focusScore: number; // 0-100 based on monitoring
  applications: string[];
  websites: string[];
  notes?: string;
}

export interface StudentProfile {
  id: string;
  persona: StudentPersona;
  major?: string;
  institution?: string;
  graduationYear?: number;
  learningGoals: LearningGoal[];
  preferredStudyTimes?: string[];
  learningStyle?: "visual" | "auditory" | "reading" | "kinesthetic";
  createdAt: string;
  updatedAt: string;
}

// Student Brain - Vector-based Knowledge Profile
export interface StudentBrainContext {
  // Static context (uploaded/configured)
  syllabi: SyllabusDocument[];
  customDocuments: IndexedDocument[];

  // Dynamic context (from Screenpipe)
  recentTopics: TopicEngagement[];
  studyPatterns: StudyPattern[];
  knowledgeGaps: KnowledgeGap[];
}

export interface SyllabusDocument {
  id: string;
  courseId?: number;
  content: string;
  uploadedAt: string;
  topics: string[];
}

export interface IndexedDocument {
  id: string;
  name: string;
  type: "pdf" | "powerpoint" | "word" | "text" | "image";
  content?: string;
  embedding?: number[];
  indexedAt: string;
  source: "canvas" | "upload" | "web";
  courseId?: number;
}

export interface TopicEngagement {
  topic: string;
  timeSpentMinutes: number;
  lastEngaged: string;
  applications: string[];
  confidence: number; // 0-100
}

export interface StudyPattern {
  dayOfWeek: number;
  hourOfDay: number;
  averageMinutes: number;
  averageFocusScore: number;
}

export interface KnowledgeGap {
  topic: string;
  identifiedFrom: "grades" | "time-on-task" | "ai-analysis";
  severity: "low" | "medium" | "high";
  suggestedResources: string[];
  relatedAssignments: number[];
}

// Focus Mode Types
export interface FocusSession {
  id: string;
  title: string;
  courseId?: number;
  assignmentId?: number;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  startedAt: string;
  endedAt?: string;
  status: "active" | "paused" | "completed" | "abandoned";
  breaks: FocusBreak[];
  distractionEvents: DistractionEvent[];
  focusScore: number;
}

export interface FocusBreak {
  startedAt: string;
  endedAt?: string;
  type: "scheduled" | "manual";
}

export interface DistractionEvent {
  timestamp: string;
  application: string;
  window?: string;
  durationSeconds: number;
  category: "social" | "entertainment" | "communication" | "other";
}

// Learning Stream Types
export interface LearningEvent {
  id: string;
  timestamp: string;
  type: "canvas" | "zoom" | "pdf" | "browser" | "application" | "audio";
  title: string;
  description?: string;
  duration?: number;
  courseId?: number;
  application?: string;
  url?: string;
  thumbnailPath?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

// Proactive Agent Types
export interface AgentInsight {
  id: string;
  type: "help-offer" | "deadline-reminder" | "study-suggestion" | "progress-update" | "knowledge-gap";
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  context: {
    courseId?: number;
    assignmentId?: number;
    topic?: string;
    sourceTimestamp?: string;
  };
  createdAt: string;
  dismissedAt?: string;
  actionTaken?: string;
}

export interface AgentAction {
  type: "summarize" | "explain" | "quiz" | "find-resources" | "schedule-study";
  parameters: Record<string, unknown>;
}

// Privacy Settings Types
export interface EduPipePrivacySettings {
  monitoringEnabled: boolean;

  // App-level privacy
  privateApps: string[]; // Apps to never monitor
  privateUrls: string[]; // URL patterns to never monitor

  // Data retention
  retentionPeriod: "1-week" | "1-month" | "3-months" | "6-months" | "1-year";
  autoDeleteEnabled: boolean;

  // Canvas data
  syncGrades: boolean;
  syncFeedback: boolean;
  syncFiles: boolean;

  // AI interactions
  cloudAiEnabled: boolean;
  anonymizePrompts: boolean;
}

// EduPipe Settings (extends base Screenpipe settings)
export interface EduPipeSettings {
  // Canvas Integration
  canvas: CanvasConfig;

  // Student Profile
  profile: StudentProfile;

  // Privacy
  privacy: EduPipePrivacySettings;

  // Focus Mode
  focusMode: {
    defaultDurationMinutes: number;
    breakIntervalMinutes: number;
    breakDurationMinutes: number;
    distractionAlerts: boolean;
    soundEnabled: boolean;
  };

  // Proactive Agent
  agent: {
    enabled: boolean;
    proactiveHelp: boolean;
    deadlineReminders: boolean;
    reminderLeadTimeDays: number;
    studySuggestions: boolean;
    notificationFrequency: "minimal" | "moderate" | "frequent";
  };

  // UI Preferences
  ui: {
    theme: "light" | "dark" | "system";
    defaultTab: "dashboard" | "courses" | "timeline" | "chat";
    showProgressBars: boolean;
    compactMode: boolean;
  };

  // Onboarding
  onboarding: {
    completed: boolean;
    completedAt?: string;
    skippedSteps: string[];
  };
}

// Default EduPipe Settings
export const DEFAULT_EDUPIPE_SETTINGS: EduPipeSettings = {
  canvas: {
    domain: "",
    accessToken: "",
    connected: false,
  },
  profile: {
    id: "",
    persona: "undergraduate",
    learningGoals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  privacy: {
    monitoringEnabled: true,
    privateApps: [
      "1Password",
      "Keychain",
      "Banking",
      "Venmo",
      "PayPal",
      "Messages",
      "WhatsApp",
      "Signal",
      "Telegram",
    ],
    privateUrls: [
      "*bank*",
      "*paypal*",
      "*venmo*",
      "mail.google.com",
      "outlook.live.com",
    ],
    retentionPeriod: "6-months",
    autoDeleteEnabled: true,
    syncGrades: true,
    syncFeedback: true,
    syncFiles: true,
    cloudAiEnabled: true,
    anonymizePrompts: false,
  },
  focusMode: {
    defaultDurationMinutes: 25,
    breakIntervalMinutes: 25,
    breakDurationMinutes: 5,
    distractionAlerts: true,
    soundEnabled: true,
  },
  agent: {
    enabled: true,
    proactiveHelp: true,
    deadlineReminders: true,
    reminderLeadTimeDays: 3,
    studySuggestions: true,
    notificationFrequency: "moderate",
  },
  ui: {
    theme: "system",
    defaultTab: "dashboard",
    showProgressBars: true,
    compactMode: false,
  },
  onboarding: {
    completed: false,
    skippedSteps: [],
  },
};
