// Canvas LMS Background Sync Service
import { CanvasAPI, createCanvasAPI } from "./canvas-api";
import {
  CanvasConfig,
  CanvasCourse,
  CanvasAssignment,
  CanvasFile,
  CanvasGrade,
  CanvasAnnouncement,
} from "./types";
import { getEduPipeStore } from "./use-edupipe-settings";

export interface SyncState {
  lastSyncAt: string | null;
  isSyncing: boolean;
  syncProgress: number;
  syncStatus: string;
  error: string | null;
}

export interface CanvasData {
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  files: CanvasFile[];
  grades: CanvasGrade[];
  announcements: CanvasAnnouncement[];
  lastUpdated: string;
}

const DEFAULT_CANVAS_DATA: CanvasData = {
  courses: [],
  assignments: [],
  files: [],
  grades: [],
  announcements: [],
  lastUpdated: "",
};

// Canvas data store operations
async function getCanvasData(): Promise<CanvasData> {
  const store = await getEduPipeStore();
  const data = await store.get<CanvasData>("canvas_data");
  return data || DEFAULT_CANVAS_DATA;
}

async function setCanvasData(data: Partial<CanvasData>): Promise<void> {
  const store = await getEduPipeStore();
  const current = await getCanvasData();
  await store.set("canvas_data", {
    ...current,
    ...data,
    lastUpdated: new Date().toISOString(),
  });
  await store.save();
}

// Sync state store operations
async function getSyncState(): Promise<SyncState> {
  const store = await getEduPipeStore();
  const state = await store.get<SyncState>("canvas_sync_state");
  return (
    state || {
      lastSyncAt: null,
      isSyncing: false,
      syncProgress: 0,
      syncStatus: "idle",
      error: null,
    }
  );
}

async function setSyncState(state: Partial<SyncState>): Promise<void> {
  const store = await getEduPipeStore();
  const current = await getSyncState();
  await store.set("canvas_sync_state", { ...current, ...state });
  await store.save();
}

export type SyncProgressCallback = (progress: number, status: string) => void;

export class CanvasSyncService {
  private api: CanvasAPI | null = null;
  private config: CanvasConfig;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private progressCallback: SyncProgressCallback | null = null;

  constructor(config: CanvasConfig) {
    this.config = config;
    this.api = createCanvasAPI(config);
  }

  setProgressCallback(callback: SyncProgressCallback): void {
    this.progressCallback = callback;
  }

  private updateProgress(progress: number, status: string): void {
    setSyncState({ syncProgress: progress, syncStatus: status });
    this.progressCallback?.(progress, status);
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.api) return false;
    return this.api.verifyConnection();
  }

  async syncAll(): Promise<CanvasData> {
    if (!this.api) {
      throw new Error("Canvas API not initialized. Please connect to Canvas first.");
    }

    const state = await getSyncState();
    if (state.isSyncing) {
      throw new Error("Sync already in progress");
    }

    await setSyncState({
      isSyncing: true,
      syncProgress: 0,
      syncStatus: "Starting sync...",
      error: null,
    });

    try {
      // Step 1: Fetch courses (10%)
      this.updateProgress(5, "Fetching courses...");
      const courses = await this.api.getCourses();
      await setCanvasData({ courses });
      this.updateProgress(15, `Found ${courses.length} courses`);

      // Step 2: Fetch assignments for each course (15% - 50%)
      this.updateProgress(20, "Fetching assignments...");
      const allAssignments: CanvasAssignment[] = [];
      const activeCourses = courses.filter((c) => c.isActive);

      for (let i = 0; i < activeCourses.length; i++) {
        const course = activeCourses[i];
        const progress = 20 + (i / activeCourses.length) * 30;
        this.updateProgress(progress, `Fetching assignments for ${course.name}...`);

        try {
          const assignments = await this.api.getAssignments(course.id);
          allAssignments.push(...assignments);
        } catch (err) {
          console.warn(`Failed to fetch assignments for course ${course.id}:`, err);
        }
      }
      await setCanvasData({ assignments: allAssignments });
      this.updateProgress(50, `Found ${allAssignments.length} assignments`);

      // Step 3: Fetch grades (50% - 60%)
      this.updateProgress(55, "Fetching grades...");
      const grades = await this.api.getGrades();
      await setCanvasData({ grades });
      this.updateProgress(60, `Found grades for ${grades.length} courses`);

      // Update course progress based on grades
      const updatedCourses = courses.map((course) => {
        const courseGrade = grades.find((g) => g.courseId === course.id);
        return {
          ...course,
          progress: courseGrade?.currentScore ?? 0,
        };
      });
      await setCanvasData({ courses: updatedCourses });

      // Step 4: Fetch files (60% - 80%)
      this.updateProgress(65, "Fetching course files...");
      const allFiles: CanvasFile[] = [];

      for (let i = 0; i < activeCourses.length; i++) {
        const course = activeCourses[i];
        const progress = 65 + (i / activeCourses.length) * 15;
        this.updateProgress(progress, `Fetching files for ${course.name}...`);

        try {
          const files = await this.api.getCourseFiles(course.id);
          // Only include PDF and document files for indexing
          const relevantFiles = files.filter((f) =>
            ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain"].includes(f.contentType)
          );
          allFiles.push(...relevantFiles);
        } catch (err) {
          console.warn(`Failed to fetch files for course ${course.id}:`, err);
        }
      }
      await setCanvasData({ files: allFiles });
      this.updateProgress(80, `Found ${allFiles.length} files`);

      // Step 5: Fetch announcements (80% - 90%)
      this.updateProgress(85, "Fetching announcements...");
      const courseIds = activeCourses.map((c) => c.id);
      const announcements = await this.api.getAnnouncements(courseIds, 14);
      await setCanvasData({ announcements });
      this.updateProgress(90, `Found ${announcements.length} announcements`);

      // Step 6: Complete (90% - 100%)
      this.updateProgress(95, "Finalizing sync...");

      const finalData = await getCanvasData();

      await setSyncState({
        isSyncing: false,
        syncProgress: 100,
        syncStatus: "Sync complete",
        lastSyncAt: new Date().toISOString(),
        error: null,
      });

      this.updateProgress(100, "Sync complete");

      return finalData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown sync error";
      await setSyncState({
        isSyncing: false,
        syncProgress: 0,
        syncStatus: "Sync failed",
        error: errorMessage,
      });
      throw err;
    }
  }

  async syncCourses(): Promise<CanvasCourse[]> {
    if (!this.api) {
      throw new Error("Canvas API not initialized");
    }

    const courses = await this.api.getCourses();
    await setCanvasData({ courses });
    return courses;
  }

  async syncAssignmentsForCourse(courseId: number): Promise<CanvasAssignment[]> {
    if (!this.api) {
      throw new Error("Canvas API not initialized");
    }

    const assignments = await this.api.getAssignments(courseId);

    // Update only this course's assignments
    const currentData = await getCanvasData();
    const otherAssignments = currentData.assignments.filter((a) => a.courseId !== courseId);
    await setCanvasData({ assignments: [...otherAssignments, ...assignments] });

    return assignments;
  }

  async getUpcomingDeadlines(days: number = 7): Promise<CanvasAssignment[]> {
    const data = await getCanvasData();
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return data.assignments
      .filter((a) => {
        if (!a.dueAt) return false;
        const dueDate = new Date(a.dueAt);
        return dueDate >= now && dueDate <= futureDate && a.submissionStatus !== "submitted";
      })
      .sort((a, b) => {
        if (!a.dueAt || !b.dueAt) return 0;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
  }

  async getCourseProgress(): Promise<Map<number, { completed: number; total: number; percentage: number }>> {
    const data = await getCanvasData();
    const progressMap = new Map<number, { completed: number; total: number; percentage: number }>();

    for (const course of data.courses) {
      const courseAssignments = data.assignments.filter((a) => a.courseId === course.id);
      const completed = courseAssignments.filter((a) => a.submissionStatus === "submitted").length;
      const total = courseAssignments.length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      progressMap.set(course.id, { completed, total, percentage });
    }

    return progressMap;
  }

  startAutoSync(intervalMinutes: number = 30): void {
    this.stopAutoSync();

    // Initial sync
    this.syncAll().catch((err) => {
      console.error("Auto-sync failed:", err);
    });

    // Set up recurring sync
    this.syncInterval = setInterval(
      () => {
        this.syncAll().catch((err) => {
          console.error("Auto-sync failed:", err);
        });
      },
      intervalMinutes * 60 * 1000
    );
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// React hook for Canvas data
export { getCanvasData, getSyncState, setCanvasData, setSyncState };

// Helper to check if sync is needed (e.g., data older than X hours)
export async function isSyncNeeded(maxAgeHours: number = 1): Promise<boolean> {
  const state = await getSyncState();
  if (!state.lastSyncAt) return true;

  const lastSync = new Date(state.lastSyncAt);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

  return hoursSinceSync >= maxAgeHours;
}
