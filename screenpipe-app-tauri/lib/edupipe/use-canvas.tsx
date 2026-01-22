"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEduPipeSettings } from "./use-edupipe-settings";
import { CanvasAPI, createCanvasAPI } from "./canvas-api";
import {
  CanvasSyncService,
  getCanvasData,
  getSyncState,
  SyncState,
  CanvasData,
  isSyncNeeded,
} from "./canvas-sync";
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasFile,
  CanvasGrade,
  CanvasAnnouncement,
} from "./types";

interface UseCanvasReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Data
  courses: CanvasCourse[];
  assignments: CanvasAssignment[];
  files: CanvasFile[];
  grades: CanvasGrade[];
  announcements: CanvasAnnouncement[];

  // Sync state
  syncState: SyncState;
  lastSyncAt: string | null;

  // Actions
  connect: (domain: string, accessToken: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  syncAll: () => Promise<void>;
  syncCourse: (courseId: number) => Promise<void>;

  // Derived data
  upcomingDeadlines: CanvasAssignment[];
  courseProgress: Map<number, { completed: number; total: number; percentage: number }>;

  // Helpers
  getCourse: (courseId: number) => CanvasCourse | undefined;
  getAssignmentsForCourse: (courseId: number) => CanvasAssignment[];
  getFilesForCourse: (courseId: number) => CanvasFile[];
  getGradeForCourse: (courseId: number) => CanvasGrade | undefined;
}

export function useCanvas(): UseCanvasReturn {
  const { settings, updateCanvasConfig, disconnectCanvas } = useEduPipeSettings();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [data, setData] = useState<CanvasData>({
    courses: [],
    assignments: [],
    files: [],
    grades: [],
    announcements: [],
    lastUpdated: "",
  });

  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncAt: null,
    isSyncing: false,
    syncProgress: 0,
    syncStatus: "idle",
    error: null,
  });

  const [upcomingDeadlines, setUpcomingDeadlines] = useState<CanvasAssignment[]>([]);
  const [courseProgress, setCourseProgress] = useState<Map<number, { completed: number; total: number; percentage: number }>>(new Map());

  const syncServiceRef = useRef<CanvasSyncService | null>(null);

  // Initialize sync service when config changes
  useEffect(() => {
    if (settings.canvas.connected && settings.canvas.accessToken) {
      syncServiceRef.current = new CanvasSyncService(settings.canvas);

      // Set up progress callback
      syncServiceRef.current.setProgressCallback((progress, status) => {
        setSyncState((prev) => ({
          ...prev,
          syncProgress: progress,
          syncStatus: status,
        }));
      });
    } else {
      syncServiceRef.current = null;
    }
  }, [settings.canvas]);

  // Load data and sync state on mount and when connection changes
  useEffect(() => {
    const loadData = async () => {
      const [canvasData, state] = await Promise.all([getCanvasData(), getSyncState()]);
      setData(canvasData);
      setSyncState(state);
    };

    loadData();

    // Set up polling for sync state updates
    const interval = setInterval(async () => {
      const state = await getSyncState();
      setSyncState(state);
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.canvas.connected]);

  // Calculate upcoming deadlines when assignments change
  useEffect(() => {
    const now = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcoming = data.assignments
      .filter((a) => {
        if (!a.dueAt) return false;
        const dueDate = new Date(a.dueAt);
        return dueDate >= now && dueDate <= weekFromNow && a.submissionStatus !== "submitted";
      })
      .sort((a, b) => {
        if (!a.dueAt || !b.dueAt) return 0;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });

    setUpcomingDeadlines(upcoming);
  }, [data.assignments]);

  // Calculate course progress when assignments change
  useEffect(() => {
    const progress = new Map<number, { completed: number; total: number; percentage: number }>();

    for (const course of data.courses) {
      const courseAssignments = data.assignments.filter((a) => a.courseId === course.id);
      const completed = courseAssignments.filter((a) => a.submissionStatus === "submitted").length;
      const total = courseAssignments.length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      progress.set(course.id, { completed, total, percentage });
    }

    setCourseProgress(progress);
  }, [data.courses, data.assignments]);

  // Auto-sync on mount if needed
  useEffect(() => {
    const checkAndSync = async () => {
      if (settings.canvas.connected && (await isSyncNeeded(1))) {
        try {
          await syncServiceRef.current?.syncAll();
          const canvasData = await getCanvasData();
          setData(canvasData);
        } catch (err) {
          console.error("Auto-sync failed:", err);
        }
      }
    };

    if (settings.canvas.connected) {
      checkAndSync();
    }
  }, [settings.canvas.connected]);

  const connect = useCallback(
    async (domain: string, accessToken: string): Promise<boolean> => {
      setIsConnecting(true);
      setConnectionError(null);

      try {
        const api = new CanvasAPI({ domain, accessToken, connected: true });
        const isValid = await api.verifyConnection();

        if (!isValid) {
          setConnectionError("Failed to verify Canvas connection. Please check your credentials.");
          setIsConnecting(false);
          return false;
        }

        const user = await api.getCurrentUser();

        await updateCanvasConfig({
          domain,
          accessToken,
          connected: true,
          userId: user.id,
          lastSync: undefined,
        });

        // Initialize sync service and do initial sync
        syncServiceRef.current = new CanvasSyncService({
          domain,
          accessToken,
          connected: true,
          userId: user.id,
        });

        syncServiceRef.current.setProgressCallback((progress, status) => {
          setSyncState((prev) => ({
            ...prev,
            syncProgress: progress,
            syncStatus: status,
          }));
        });

        // Start initial sync
        const canvasData = await syncServiceRef.current.syncAll();
        setData(canvasData);

        setIsConnecting(false);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to connect to Canvas";
        setConnectionError(errorMessage);
        setIsConnecting(false);
        return false;
      }
    },
    [updateCanvasConfig]
  );

  const disconnect = useCallback(async () => {
    syncServiceRef.current?.stopAutoSync();
    syncServiceRef.current = null;
    await disconnectCanvas();
    setData({
      courses: [],
      assignments: [],
      files: [],
      grades: [],
      announcements: [],
      lastUpdated: "",
    });
    setSyncState({
      lastSyncAt: null,
      isSyncing: false,
      syncProgress: 0,
      syncStatus: "idle",
      error: null,
    });
  }, [disconnectCanvas]);

  const syncAll = useCallback(async () => {
    if (!syncServiceRef.current) {
      throw new Error("Canvas not connected");
    }

    const canvasData = await syncServiceRef.current.syncAll();
    setData(canvasData);
  }, []);

  const syncCourse = useCallback(async (courseId: number) => {
    if (!syncServiceRef.current) {
      throw new Error("Canvas not connected");
    }

    await syncServiceRef.current.syncAssignmentsForCourse(courseId);
    const canvasData = await getCanvasData();
    setData(canvasData);
  }, []);

  const getCourse = useCallback(
    (courseId: number) => {
      return data.courses.find((c) => c.id === courseId);
    },
    [data.courses]
  );

  const getAssignmentsForCourse = useCallback(
    (courseId: number) => {
      return data.assignments.filter((a) => a.courseId === courseId);
    },
    [data.assignments]
  );

  const getFilesForCourse = useCallback(
    (courseId: number) => {
      return data.files.filter((f) => f.courseId === courseId);
    },
    [data.files]
  );

  const getGradeForCourse = useCallback(
    (courseId: number) => {
      return data.grades.find((g) => g.courseId === courseId);
    },
    [data.grades]
  );

  return {
    // Connection state
    isConnected: settings.canvas.connected,
    isConnecting,
    connectionError,

    // Data
    courses: data.courses,
    assignments: data.assignments,
    files: data.files,
    grades: data.grades,
    announcements: data.announcements,

    // Sync state
    syncState,
    lastSyncAt: syncState.lastSyncAt,

    // Actions
    connect,
    disconnect,
    syncAll,
    syncCourse,

    // Derived data
    upcomingDeadlines,
    courseProgress,

    // Helpers
    getCourse,
    getAssignmentsForCourse,
    getFilesForCourse,
    getGradeForCourse,
  };
}
