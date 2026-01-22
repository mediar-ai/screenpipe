"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Coffee,
  Timer,
  Target,
  Brain,
  Zap,
  Volume2,
  VolumeX,
  Settings,
  TrendingUp,
  Clock,
} from "lucide-react";
import { FocusSession, DistractionEvent } from "@/lib/edupipe/types";

type FocusState = "idle" | "focusing" | "paused" | "break";

interface FocusModeProps {
  onClose?: () => void;
}

export function FocusMode({ onClose }: FocusModeProps) {
  const { courses, assignments } = useCanvas();
  const { settings, updateSettings } = useEduPipeSettings();

  // Timer state
  const [state, setState] = useState<FocusState>("idle");
  const [timeRemaining, setTimeRemaining] = useState(settings.focusMode.defaultDurationMinutes * 60);
  const [totalTime, setTotalTime] = useState(settings.focusMode.defaultDurationMinutes * 60);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  // Focus session tracking
  const [currentSession, setCurrentSession] = useState<Partial<FocusSession> | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [sessionTitle, setSessionTitle] = useState("");

  // Settings
  const [duration, setDuration] = useState(settings.focusMode.defaultDurationMinutes);
  const [breakDuration, setBreakDuration] = useState(settings.focusMode.breakDurationMinutes);
  const [soundEnabled, setSoundEnabled] = useState(settings.focusMode.soundEnabled);

  // Dialogs
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);

  // Distraction tracking
  const [distractions, setDistractions] = useState<DistractionEvent[]>([]);
  const [focusScore, setFocusScore] = useState(100);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Timer logic
  useEffect(() => {
    if (state === "focusing" || state === "break") {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state]);

  // Handle timer completion
  const handleTimerComplete = useCallback(() => {
    if (state === "focusing") {
      setSessionsCompleted((prev) => prev + 1);
      playSound("complete");
      setShowBreakDialog(true);
      setState("idle");

      // Save session
      if (currentSession) {
        const completedSession: FocusSession = {
          id: currentSession.id || crypto.randomUUID(),
          title: sessionTitle || "Focus Session",
          courseId: selectedCourseId ? parseInt(selectedCourseId) : undefined,
          assignmentId: selectedAssignmentId ? parseInt(selectedAssignmentId) : undefined,
          plannedDurationMinutes: duration,
          actualDurationMinutes: duration,
          startedAt: currentSession.startedAt || new Date().toISOString(),
          endedAt: new Date().toISOString(),
          status: "completed",
          breaks: [],
          distractionEvents: distractions,
          focusScore: focusScore,
        };
        // TODO: Save session to store
        console.log("Session completed:", completedSession);
      }
    } else if (state === "break") {
      playSound("break-end");
      setState("idle");
      setTimeRemaining(duration * 60);
      setTotalTime(duration * 60);
    }
  }, [state, currentSession, sessionTitle, selectedCourseId, selectedAssignmentId, duration, distractions, focusScore]);

  const playSound = (type: "start" | "complete" | "break-end" | "tick") => {
    if (!soundEnabled || !audioRef.current) return;
    // In a real implementation, load actual sound files
    console.log("Playing sound:", type);
  };

  const startFocus = () => {
    const newSession: Partial<FocusSession> = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      status: "active",
    };
    setCurrentSession(newSession);
    setTimeRemaining(duration * 60);
    setTotalTime(duration * 60);
    setDistractions([]);
    setFocusScore(100);
    setState("focusing");
    playSound("start");
  };

  const pauseFocus = () => {
    setState("paused");
  };

  const resumeFocus = () => {
    setState("focusing");
  };

  const stopFocus = () => {
    if (state === "focusing" && timeRemaining > totalTime * 0.5) {
      setShowAbandonDialog(true);
    } else {
      endSession();
    }
  };

  const endSession = () => {
    setState("idle");
    setTimeRemaining(duration * 60);
    setTotalTime(duration * 60);
    setCurrentSession(null);
  };

  const startBreak = () => {
    setTimeRemaining(breakDuration * 60);
    setTotalTime(breakDuration * 60);
    setState("break");
    setShowBreakDialog(false);
  };

  const skipBreak = () => {
    setShowBreakDialog(false);
    setTimeRemaining(duration * 60);
    setTotalTime(duration * 60);
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progressPercent = ((totalTime - timeRemaining) / totalTime) * 100;

  // Get assignment options for selected course
  const courseAssignments = selectedCourseId
    ? assignments.filter((a) => a.courseId === parseInt(selectedCourseId))
    : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          <span className="font-semibold">Focus Mode</span>
          {state !== "idle" && (
            <Badge variant={state === "break" ? "secondary" : "default"}>
              {state === "focusing" ? "Focusing" : state === "paused" ? "Paused" : "Break"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8">
          {/* Timer Display */}
          <div className="text-center">
            <div className="relative inline-flex items-center justify-center">
              <svg className="w-64 h-64 transform -rotate-90">
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 120}
                  strokeDashoffset={2 * Math.PI * 120 * (1 - progressPercent / 100)}
                  className={state === "break" ? "text-green-500" : "text-primary"}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-mono font-bold">{formatTime(timeRemaining)}</span>
                <span className="text-sm text-muted-foreground mt-2">
                  {state === "break" ? "Break Time" : state === "focusing" ? "Stay Focused" : "Ready to Focus?"}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {state === "idle" && (
              <Button size="lg" className="gap-2 px-8" onClick={startFocus}>
                <Play className="h-5 w-5" />
                Start Focus
              </Button>
            )}

            {state === "focusing" && (
              <>
                <Button size="lg" variant="outline" onClick={pauseFocus}>
                  <Pause className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="destructive" onClick={stopFocus}>
                  <Square className="h-5 w-5" />
                </Button>
              </>
            )}

            {state === "paused" && (
              <>
                <Button size="lg" className="gap-2" onClick={resumeFocus}>
                  <Play className="h-5 w-5" />
                  Resume
                </Button>
                <Button size="lg" variant="destructive" onClick={stopFocus}>
                  <Square className="h-5 w-5" />
                </Button>
              </>
            )}

            {state === "break" && (
              <Button size="lg" className="gap-2" onClick={skipBreak}>
                Skip Break
              </Button>
            )}
          </div>

          {/* Session Setup (only when idle) */}
          {state === "idle" && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Session Setup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Duration Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Duration</label>
                    <span className="text-sm text-muted-foreground">{duration} minutes</span>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={([value]) => setDuration(value)}
                    min={5}
                    max={120}
                    step={5}
                  />
                </div>

                {/* Course Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Course (optional)</label>
                  <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No specific course</SelectItem>
                      {courses.filter((c) => c.isActive).map((course) => (
                        <SelectItem key={course.id} value={course.id.toString()}>
                          {course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignment Selection */}
                {selectedCourseId && courseAssignments.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Assignment (optional)</label>
                    <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an assignment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No specific assignment</SelectItem>
                        {courseAssignments.map((assignment) => (
                          <SelectItem key={assignment.id} value={assignment.id.toString()}>
                            {assignment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Session Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <Target className="h-5 w-5 mx-auto mb-2" />
              <p className="text-2xl font-bold">{sessionsCompleted}</p>
              <p className="text-xs text-muted-foreground">Sessions Today</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <Brain className="h-5 w-5 mx-auto mb-2" />
              <p className="text-2xl font-bold">{focusScore}%</p>
              <p className="text-xs text-muted-foreground">Focus Score</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <Zap className="h-5 w-5 mx-auto mb-2" />
              <p className="text-2xl font-bold">{distractions.length}</p>
              <p className="text-xs text-muted-foreground">Distractions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Abandon Session Dialog */}
      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Focus Session?</AlertDialogTitle>
            <AlertDialogDescription>
              You still have {formatTime(timeRemaining)} remaining. Are you sure you want to end this session early?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Focusing</AlertDialogCancel>
            <AlertDialogAction onClick={endSession}>End Session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Break Dialog */}
      <AlertDialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Great Work! Time for a Break
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've completed a focus session! Take a {breakDuration}-minute break to recharge.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={skipBreak}>Skip Break</AlertDialogCancel>
            <AlertDialogAction onClick={startBreak}>Start Break</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default FocusMode;
