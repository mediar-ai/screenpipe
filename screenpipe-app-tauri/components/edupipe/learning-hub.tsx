"use client";

import React, { useState } from "react";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  RefreshCw,
  Settings,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { CanvasAssignment, CanvasCourse } from "@/lib/edupipe/types";
import { formatDistanceToNow, format, isToday, isTomorrow, isThisWeek } from "date-fns";

interface LearningHubProps {
  onOpenFocusMode?: () => void;
  onOpenSettings?: () => void;
}

export function LearningHub({ onOpenFocusMode, onOpenSettings }: LearningHubProps) {
  const {
    isConnected,
    courses,
    upcomingDeadlines,
    courseProgress,
    syncState,
    syncAll,
    grades,
  } = useCanvas();

  const { settings } = useEduPipeSettings();
  const [activeTab, setActiveTab] = useState<string>("overview");

  const activeCourses = courses.filter((c) => c.isActive);

  // Calculate overall stats
  const totalAssignments = upcomingDeadlines.length;
  const urgentDeadlines = upcomingDeadlines.filter((a) => {
    if (!a.dueAt) return false;
    const dueDate = new Date(a.dueAt);
    const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursUntilDue <= 24;
  });

  const averageGrade = grades.length > 0
    ? grades.reduce((sum, g) => sum + (g.currentScore ?? 0), 0) / grades.length
    : null;

  if (!isConnected) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Welcome to EduPipe
          </CardTitle>
          <CardDescription>
            Connect your Canvas LMS account to get started with your personalized learning dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onOpenSettings} className="gap-2">
            <Settings className="h-4 w-4" />
            Connect Canvas
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Learning Hub
          </h1>
          <p className="text-muted-foreground">
            Welcome back, {settings.profile.persona === "undergraduate" ? "Student" : settings.profile.persona}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAll()}
            disabled={syncState.isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncState.isSyncing ? "animate-spin" : ""}`} />
            {syncState.isSyncing ? "Syncing..." : "Sync"}
          </Button>
          <Button variant="default" size="sm" onClick={onOpenFocusMode} className="gap-2">
            <Timer className="h-4 w-4" />
            Focus Mode
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Courses"
          value={activeCourses.length.toString()}
          icon={<BookOpen className="h-4 w-4" />}
          description="This semester"
        />
        <StatCard
          title="Upcoming Deadlines"
          value={totalAssignments.toString()}
          icon={<Calendar className="h-4 w-4" />}
          description="Next 7 days"
          alert={urgentDeadlines.length > 0}
        />
        <StatCard
          title="Average Grade"
          value={averageGrade !== null ? `${Math.round(averageGrade)}%` : "N/A"}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Across all courses"
        />
        <StatCard
          title="Study Time Today"
          value="0h"
          icon={<Clock className="h-4 w-4" />}
          description="Focus sessions"
        />
      </div>

      {/* Urgent Deadlines Alert */}
      {urgentDeadlines.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Urgent: {urgentDeadlines.length} deadline{urgentDeadlines.length > 1 ? "s" : ""} due within 24 hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentDeadlines.slice(0, 3).map((assignment) => (
                <DeadlineItem key={assignment.id} assignment={assignment} courses={courses} urgent />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Course Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Course Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeCourses.slice(0, 4).map((course) => {
                  const progress = courseProgress.get(course.id);
                  return (
                    <CourseProgressItem key={course.id} course={course} progress={progress} />
                  );
                })}
                {activeCourses.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active courses found</p>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Deadlines */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingDeadlines.slice(0, 5).map((assignment) => (
                  <DeadlineItem key={assignment.id} assignment={assignment} courses={courses} />
                ))}
                {upcomingDeadlines.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    No upcoming deadlines this week
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="courses" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                progress={courseProgress.get(course.id)}
                grade={grades.find((g) => g.courseId === course.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="deadlines" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {upcomingDeadlines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>No upcoming deadlines!</p>
                </div>
              ) : (
                upcomingDeadlines.map((assignment) => (
                  <DeadlineItem key={assignment.id} assignment={assignment} courses={courses} detailed />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {grades.map((grade) => (
                <div key={grade.courseId} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{grade.courseName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {grade.currentGrade || (grade.currentScore !== undefined ? `${Math.round(grade.currentScore)}%` : "N/A")}
                    </p>
                    {grade.currentScore !== undefined && !grade.currentGrade && (
                      <p className="text-sm text-muted-foreground">Current Score</p>
                    )}
                  </div>
                </div>
              ))}
              {grades.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No grades available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sync Status */}
      {syncState.isSyncing && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <div>
              <p className="text-sm font-medium">{syncState.syncStatus}</p>
              <Progress value={syncState.syncProgress} className="h-1 w-32 mt-1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components
function StatCard({
  title,
  value,
  icon,
  description,
  alert,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-destructive/50" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className={`p-2 rounded-lg ${alert ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
            {icon}
          </div>
          {alert && <AlertCircle className="h-4 w-4 text-destructive" />}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseProgressItem({
  course,
  progress,
}: {
  course: CanvasCourse;
  progress?: { completed: number; total: number; percentage: number };
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate max-w-[200px]">{course.name}</span>
        <span className="text-sm text-muted-foreground">
          {progress ? `${progress.completed}/${progress.total}` : "0/0"}
        </span>
      </div>
      <Progress value={progress?.percentage ?? 0} className="h-2" />
    </div>
  );
}

function DeadlineItem({
  assignment,
  courses,
  urgent,
  detailed,
}: {
  assignment: CanvasAssignment;
  courses: CanvasCourse[];
  urgent?: boolean;
  detailed?: boolean;
}) {
  const course = courses.find((c) => c.id === assignment.courseId);
  const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;

  const getDeadlineLabel = () => {
    if (!dueDate) return "No due date";
    if (isToday(dueDate)) return "Due today";
    if (isTomorrow(dueDate)) return "Due tomorrow";
    if (isThisWeek(dueDate)) return format(dueDate, "EEEE");
    return format(dueDate, "MMM d");
  };

  const getDeadlineTime = () => {
    if (!dueDate) return "";
    return format(dueDate, "h:mm a");
  };

  return (
    <div className={`flex items-start gap-3 p-2 rounded-lg ${urgent ? "bg-destructive/10" : "hover:bg-muted/50"}`}>
      <div className={`p-2 rounded-lg ${urgent ? "bg-destructive/20" : "bg-muted"}`}>
        <FileText className={`h-4 w-4 ${urgent ? "text-destructive" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{assignment.name}</p>
        <p className="text-xs text-muted-foreground">{course?.name || "Unknown Course"}</p>
        {detailed && assignment.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {assignment.description.replace(/<[^>]*>/g, "")}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <Badge variant={urgent ? "destructive" : "secondary"} className="text-xs">
          {getDeadlineLabel()}
        </Badge>
        {dueDate && (
          <p className="text-xs text-muted-foreground mt-1">{getDeadlineTime()}</p>
        )}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  progress,
  grade,
}: {
  course: CanvasCourse;
  progress?: { completed: number; total: number; percentage: number };
  grade?: { currentScore?: number; currentGrade?: string };
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base truncate">{course.name}</CardTitle>
        <CardDescription>{course.code}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Progress</span>
            <span>{progress?.percentage ?? 0}%</span>
          </div>
          <Progress value={progress?.percentage ?? 0} className="h-2" />
          {grade && (
            <div className="flex items-center justify-between text-sm pt-2">
              <span className="text-muted-foreground">Current Grade</span>
              <span className="font-semibold">
                {grade.currentGrade || (grade.currentScore !== undefined ? `${Math.round(grade.currentScore)}%` : "N/A")}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LearningHub;
