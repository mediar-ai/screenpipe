"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  Video,
  FileText,
  Globe,
  Mic,
  Monitor,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Play,
  ExternalLink,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays, isToday, isYesterday } from "date-fns";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { LearningEvent } from "@/lib/edupipe/types";

// Educational app patterns to identify
const EDUCATIONAL_PATTERNS = {
  canvas: ["canvas", "instructure"],
  zoom: ["zoom.us", "zoom meeting"],
  pdf: [".pdf", "adobe reader", "preview"],
  docs: ["google docs", "microsoft word", "notion", "obsidian"],
  video: ["youtube.com/watch", "vimeo", "coursera", "udemy", "khan academy"],
  research: ["scholar.google", "jstor", "pubmed", "arxiv"],
};

interface LearningStreamProps {
  initialDate?: Date;
  onEventClick?: (event: LearningEvent) => void;
}

export function LearningStream({ initialDate = new Date(), onEventClick }: LearningStreamProps) {
  const { courses } = useCanvas();
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch learning events from Screenpipe
  const fetchLearningEvents = useCallback(async () => {
    setIsLoading(true);

    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      // Query Screenpipe API for screen data
      const response = await fetch(
        `http://localhost:3030/search?` +
          new URLSearchParams({
            content_type: "all",
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            limit: "500",
          })
      );

      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }

      const data = await response.json();

      // Transform Screenpipe data into LearningEvents
      const transformedEvents = transformScreenpipeData(data.data || []);

      // Filter to educational content
      const educationalEvents = transformedEvents.filter(isEducationalEvent);

      // Apply search filter
      let filteredEvents = educationalEvents;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredEvents = filteredEvents.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            e.description?.toLowerCase().includes(query) ||
            e.tags.some((t) => t.toLowerCase().includes(query))
        );
      }

      // Apply type filter
      if (filterType !== "all") {
        filteredEvents = filteredEvents.filter((e) => e.type === filterType);
      }

      setEvents(filteredEvents);
    } catch (error) {
      console.error("Failed to fetch learning events:", error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, searchQuery, filterType]);

  useEffect(() => {
    fetchLearningEvents();
  }, [fetchLearningEvents]);

  // Transform Screenpipe data to LearningEvents
  function transformScreenpipeData(data: unknown[]): LearningEvent[] {
    return (data as Array<{
      type: string;
      content: {
        timestamp: string;
        app_name?: string;
        window_name?: string;
        browser_url?: string;
        text?: string;
        transcription?: string;
        file_path?: string;
        frame_id?: number;
      };
    }>).map((item, index) => {
      const content = item.content;
      const type = categorizeContent(item);

      return {
        id: `${content.timestamp}-${index}`,
        timestamp: content.timestamp,
        type: type,
        title: extractTitle(content),
        description: content.text || content.transcription,
        application: content.app_name,
        url: content.browser_url,
        tags: extractTags(content),
        courseId: matchCourse(content, courses),
        thumbnailPath: content.file_path,
        metadata: {
          frameId: content.frame_id,
          windowName: content.window_name,
        },
      };
    });
  }

  function categorizeContent(item: { type: string; content: { app_name?: string; browser_url?: string } }): LearningEvent["type"] {
    const appName = (item.content.app_name || "").toLowerCase();
    const url = (item.content.browser_url || "").toLowerCase();

    if (EDUCATIONAL_PATTERNS.canvas.some((p) => url.includes(p) || appName.includes(p))) {
      return "canvas";
    }
    if (EDUCATIONAL_PATTERNS.zoom.some((p) => url.includes(p) || appName.includes(p))) {
      return "zoom";
    }
    if (EDUCATIONAL_PATTERNS.pdf.some((p) => url.includes(p) || appName.includes(p))) {
      return "pdf";
    }
    if (item.type === "audio") {
      return "audio";
    }
    if (url) {
      return "browser";
    }
    return "application";
  }

  function extractTitle(content: { app_name?: string; window_name?: string; browser_url?: string }): string {
    if (content.window_name) {
      // Clean up window title
      const title = content.window_name
        .replace(/ - Google Chrome$/, "")
        .replace(/ - Firefox$/, "")
        .replace(/ - Safari$/, "")
        .replace(/ \| .*$/, "");
      return title.length > 60 ? title.substring(0, 60) + "..." : title;
    }
    if (content.browser_url) {
      try {
        const url = new URL(content.browser_url);
        return url.hostname;
      } catch {
        return content.browser_url;
      }
    }
    return content.app_name || "Unknown";
  }

  function extractTags(content: { app_name?: string; browser_url?: string; text?: string }): string[] {
    const tags: string[] = [];
    const url = (content.browser_url || "").toLowerCase();
    const text = (content.text || "").toLowerCase();

    if (url.includes("canvas") || url.includes("instructure")) tags.push("Canvas");
    if (url.includes("zoom")) tags.push("Zoom");
    if (url.includes("youtube")) tags.push("Video");
    if (url.includes("scholar.google")) tags.push("Research");
    if (url.includes("github")) tags.push("Code");
    if (content.app_name?.toLowerCase().includes("pdf")) tags.push("PDF");

    return tags;
  }

  function matchCourse(content: { text?: string; window_name?: string }, courseList: typeof courses): number | undefined {
    const searchText = `${content.text || ""} ${content.window_name || ""}`.toLowerCase();

    for (const course of courseList) {
      if (
        searchText.includes(course.name.toLowerCase()) ||
        searchText.includes(course.code.toLowerCase())
      ) {
        return course.id;
      }
    }
    return undefined;
  }

  function isEducationalEvent(event: LearningEvent): boolean {
    const educationalTypes: LearningEvent["type"][] = ["canvas", "zoom", "pdf"];
    if (educationalTypes.includes(event.type)) return true;

    // Check if browser URL is educational
    if (event.url) {
      const url = event.url.toLowerCase();
      const allPatterns = Object.values(EDUCATIONAL_PATTERNS).flat();
      if (allPatterns.some((pattern) => url.includes(pattern))) return true;
    }

    // Check if associated with a course
    if (event.courseId) return true;

    // Check tags
    if (event.tags.length > 0) return true;

    return false;
  }

  // Navigation
  const goToPreviousDay = () => setSelectedDate((d) => subDays(d, 1));
  const goToNextDay = () => {
    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow <= new Date()) {
      setSelectedDate(tomorrow);
    }
  };
  const goToToday = () => setSelectedDate(new Date());

  // Group events by hour
  const groupedEvents = events.reduce(
    (groups, event) => {
      const hour = new Date(event.timestamp).getHours();
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(event);
      return groups;
    },
    {} as Record<number, LearningEvent[]>
  );

  // Date label
  const getDateLabel = () => {
    if (isToday(selectedDate)) return "Today";
    if (isYesterday(selectedDate)) return "Yesterday";
    return format(selectedDate, "EEEE, MMMM d");
  };

  // Event type icon
  const getEventIcon = (type: LearningEvent["type"]) => {
    switch (type) {
      case "canvas":
        return <GraduationCap className="h-4 w-4" />;
      case "zoom":
        return <Video className="h-4 w-4" />;
      case "pdf":
        return <FileText className="h-4 w-4" />;
      case "browser":
        return <Globe className="h-4 w-4" />;
      case "audio":
        return <Mic className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: LearningEvent["type"]) => {
    switch (type) {
      case "canvas":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "zoom":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "pdf":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "browser":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "audio":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h2 className="font-semibold">Learning Stream</h2>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <Button variant="ghost" size="icon" onClick={goToPreviousDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{getDateLabel()}</span>
          {!isToday(selectedDate) && (
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Today
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextDay}
          disabled={isToday(selectedDate)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 p-4 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search learning activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="canvas">Canvas</SelectItem>
            <SelectItem value="zoom">Zoom</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
            <SelectItem value="browser">Browser</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No learning activities found for this day</p>
              <p className="text-sm mt-1">
                Try selecting a different date or adjusting your filters
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEvents)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .map(([hour, hourEvents]) => (
                  <div key={hour} className="relative">
                    {/* Hour label */}
                    <div className="sticky top-0 bg-background z-10 py-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">
                        {format(new Date().setHours(parseInt(hour), 0), "h:00 a")}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                      <Badge variant="secondary" className="text-xs">
                        {hourEvents.length} events
                      </Badge>
                    </div>

                    {/* Events */}
                    <div className="space-y-2 pl-6 border-l-2 border-muted ml-2">
                      {hourEvents.map((event) => {
                        const course = courses.find((c) => c.id === event.courseId);
                        return (
                          <Card
                            key={event.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => onEventClick?.(event)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div
                                  className={`p-2 rounded-lg border ${getEventColor(event.type)}`}
                                >
                                  {getEventIcon(event.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{event.title}</p>
                                      {event.application && (
                                        <p className="text-xs text-muted-foreground">
                                          {event.application}
                                        </p>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {format(new Date(event.timestamp), "h:mm a")}
                                    </span>
                                  </div>

                                  {event.description && (
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                      {event.description}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {event.tags.map((tag) => (
                                      <Badge key={tag} variant="outline" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                    {course && (
                                      <Badge variant="secondary" className="text-xs">
                                        {course.code}
                                      </Badge>
                                    )}
                                    {event.url && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(event.url, "_blank");
                                        }}
                                      >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Open
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary Footer */}
      {events.length > 0 && (
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {events.length} learning activities
            </span>
            <div className="flex items-center gap-4">
              {Object.entries(
                events.reduce(
                  (acc, e) => {
                    acc[e.type] = (acc[e.type] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>
                )
              )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-1">
                    {getEventIcon(type as LearningEvent["type"])}
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LearningStream;
