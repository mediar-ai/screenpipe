"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { OpenAI } from "openai";
import { generateId, Message } from "ai";
import { useSettings } from "@/lib/hooks/use-settings";
import { ChatMessage } from "@/components/chat-message-v2";
import { useToast } from "@/components/ui/use-toast";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import {
  Loader2,
  Send,
  Square,
  X,
  GripHorizontal,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";
import { invoke } from "@tauri-apps/api/core";
import {
  TimelineDock,
  TimelineDockIcon,
  TimelineIconsSection,
} from "@/components/timeline/timeline-dock";
import { debounce, throttle } from "lodash";
import { TimelineBlocks } from "@/components/timeline/timeline-block";
import { TimeLabels } from "@/components/timeline/time-labels";
import { CurrentTimeIndicator } from "@/components/timeline/current-time-indicator";
import { ChatPanel } from "@/components/timeline/chat-panel";

interface StreamTimeSeriesResponse {
  timestamp: string;
  devices: DeviceFrameResponse[];
}

interface DeviceFrameResponse {
  device_id: string;
  frame: string; // base64 encoded image
  metadata: DeviceMetadata;
  audio: AudioData[];
}

interface DeviceMetadata {
  file_path: string;
  app_name: string;
  window_name: string;
  ocr_text: string;
  timestamp: string;
}

interface AudioData {
  device_name: string;
  is_input: boolean;
  transcription: string;
  audio_file_path: string;
  duration_secs: number;
  start_offset: number;
}

interface TimeRange {
  start: Date;
  end: Date;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  dataSelector: (frames: StreamTimeSeriesResponse[]) => any;
}

interface AppIconCache {
  [key: string]: string; // app_name -> base64 icon
}

const AGENTS: Agent[] = [
  {
    id: "context-master",
    name: "context master",
    description: "analyzes everything: apps, windows, text & audio",
    dataSelector: (frames) =>
      frames.map((frame) => ({
        timestamp: frame.timestamp,
        devices: frame.devices.map((device) => ({
          device_id: device.device_id,
          metadata: device.metadata,
          audio: device.audio,
        })),
      })),
  },
  {
    id: "window-tracker",
    name: "window tracker",
    description: "focuses on app switching patterns",
    dataSelector: (frames) =>
      frames.map((frame) => ({
        timestamp: frame.timestamp,
        windows: frame.devices.map((device) => ({
          app: device.metadata.app_name,
          window: device.metadata.window_name,
        })),
      })),
  },
  {
    id: "text-scanner",
    name: "text scanner",
    description: "analyzes visible text (OCR)",
    dataSelector: (frames) =>
      frames.map((frame) => ({
        timestamp: frame.timestamp,
        text: frame.devices
          .map((device) => device.metadata.ocr_text)
          .filter(Boolean),
      })),
  },
  {
    id: "voice-analyzer",
    name: "voice analyzer",
    description: "focuses on audio transcriptions",
    dataSelector: (frames) =>
      frames.map((frame) => ({
        timestamp: frame.timestamp,
        audio: frame.devices.flatMap((device) => device.audio),
      })),
  },
];

export interface TimeBlock {
  appName: string;
  startTime: Date;
  endTime: Date;
  color: string; // We'll generate colors based on app names
}
export interface TimelineBlock extends TimeBlock {
  left: number; // percentage position from left
  width: number; // percentage width
}

function getAppColor(appName: string): string {
  // Simple hash function to generate consistent colors for apps
  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = appName.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert to RGB - using mostly blue and green hues for a tech feel
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function calculateTimeBlocks(frames: any[]): TimeBlock[] {
  if (frames.length === 0) return [];

  const timeRange = getTimelineRange(frames);
  const blocks: TimeBlock[] = [];
  let currentBlock: TimeBlock | null = null;

  // Sort frames by timestamp
  // const sortedFrames = [...frames].sort(
  //   (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  // );

  frames.forEach((frame) => {
    const timestamp = new Date(frame.timestamp);
    const appName = frame.devices[0].metadata.app_name;

    // Skip frames outside the timeline range
    if (timestamp < timeRange.start || timestamp > timeRange.end) {
      return;
    }

    if (!currentBlock) {
      currentBlock = {
        appName,
        startTime: timestamp,
        endTime: timestamp,
        color: getAppColor(appName),
      };
    } else if (currentBlock.appName !== appName) {
      // App changed, close current block and start new one
      currentBlock.endTime = timestamp;
      blocks.push(currentBlock);
      currentBlock = {
        appName,
        startTime: timestamp,
        endTime: timestamp,
        color: getAppColor(appName),
      };
    } else {
      // Same app, update end time
      currentBlock.endTime = timestamp;
    }
  });

  // Add the last block
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function getTimelineRange(frames: StreamTimeSeriesResponse[]): {
  start: Date;
  end: Date;
} {
  // Default range: 8am to current time
  const now = new Date();
  const defaultEnd = now;
  const defaultStart = new Date(now);
  defaultStart.setHours(8, 0, 0, 0);

  if (frames.length === 0) {
    return { start: defaultStart, end: defaultEnd };
  }

  // Find actual data range
  const timestamps = frames.map((f) => new Date(f.timestamp));
  const dataStart = new Date(Math.min(...timestamps.map((t) => t.getTime())));
  const dataEnd = new Date(Math.max(...timestamps.map((t) => t.getTime())));

  // Expand range if data exists outside default range
  return {
    start:
      dataStart.getTime() < defaultStart.getTime() ? dataStart : defaultStart,
    end: dataEnd.getTime() > defaultEnd.getTime() ? dataEnd : defaultEnd,
  };
}

function getUniqueAppRanges(
  blocks: TimeBlock[],
  mergeThresholdMs: number = 300000
): TimelineBlock[] {
  if (blocks.length === 0) return [];

  const sortedBlocks = [...blocks].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  const mergedBlocks = sortedBlocks.reduce((acc: TimeBlock[], curr) => {
    const lastBlock = acc[acc.length - 1];

    if (!lastBlock) {
      return [curr];
    }

    if (
      lastBlock.appName === curr.appName &&
      curr.startTime.getTime() - lastBlock.endTime.getTime() <= mergeThresholdMs
    ) {
      lastBlock.endTime = new Date(
        Math.max(lastBlock.endTime.getTime(), curr.endTime.getTime())
      );
      return acc;
    }

    return [...acc, curr];
  }, []);

  // Use dynamic range instead of full day
  // @ts-ignore
  const timeRange = getTimelineRange(frames);
  const totalMs = timeRange.end.getTime() - timeRange.start.getTime();

  return mergedBlocks.map((block) => {
    const left =
      ((block.startTime.getTime() - timeRange.start.getTime()) / totalMs) * 100;
    const width =
      ((block.endTime.getTime() - block.startTime.getTime()) / totalMs) * 100;

    return {
      ...block,
      left: Math.max(0, Math.min(100, left)),
      width: Math.max(0, Math.min(100 - left, width)),
    };
  });
}

export default function Timeline() {
  const [currentFrame, setCurrentFrame] = useState<DeviceFrameResponse | null>(
    null
  );
  const [frames, setFrames] = useState<StreamTimeSeriesResponse[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedTimeRange, setLoadedTimeRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRange, setSelectionRange] = useState<TimeRange | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const { settings } = useSettings();
  const { toast } = useToast();
  const [chatMessages, setChatMessages] = useState<Array<Message>>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isAiPanelExpanded, setIsAiPanelExpanded] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [isHoveringAiPanel, setIsHoveringAiPanel] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [osType, setOsType] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0]);
  const [chatWindowSize, setChatWindowSize] = useState({
    width: 400,
    height: 500,
  });
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const [iconCache, setIconCache] = useState<AppIconCache>({});

  // 1. Memoize time range calculation
  const timelineRange = useMemo(() => getTimelineRange(frames), [frames]);

  // 2. Memoize time blocks calculation
  const timeBlocks = useMemo(() => calculateTimeBlocks(frames), [frames]);

  // 3. Memoize app ranges calculation with merged threshold
  const appRanges = useMemo(
    () => getUniqueAppRanges(timeBlocks, 300000),
    [timeBlocks]
  );

  useEffect(() => {
    setPosition({
      x: window.innerWidth - 400,
      y: window.innerHeight / 4,
    });
  }, []);

  const setupEventSource = () => {
    // Reset states when reloading
    setFrames([]);
    setCurrentFrame(null);
    setCurrentIndex(0);
    setIsLoading(true);
    setError(null);
    setSelectionRange(null);
    setIsAiPanelExpanded(false);
    setChatMessages([]);
    setAiInput("");

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() - 2);
    const startTime = new Date();
    startTime.setHours(0, 1, 0, 0);
    const url = `http://localhost:3030/stream/frames?start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&order=descending`;

    setLoadedTimeRange({
      start: startTime,
      end: endTime,
    });

    console.log("starting stream:", url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data === "keep-alive-text") return;

        // Add error handling for server-side errors
        if (data.error) {
          console.error("server error:", data.error);
          setError(data.error);
          setIsLoading(false);
          return;
        }

        if (data.timestamp && data.devices) {
          console.log("new frame:", data.timestamp, data.devices);
          setFrames((prev) => {
            const exists = prev.some((f) => f.timestamp === data.timestamp);
            if (exists) return prev;

            const MAX_FRAMES = 1000;

            // Add new frame and maintain limit
            // const newFrames = [...prev, data].sort(
            //   (a, b) =>
            //     new Date(b.timestamp).getTime() -
            //     new Date(a.timestamp).getTime()
            // );
            // .slice(0, MAX_FRAMES); // TODO: likely rem

            // return newFrames;
            return [...prev, data];
          });

          // Only set initial frame if we don't have one
          setCurrentFrame((prev) => prev || data.devices[0]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("failed to parse frame data:", error);
        setError("failed to parse server response");
        setIsLoading(false);
      }
    };

    eventSource.onerror = (error) => {
      setIsLoading(false);

      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("stream ended (expected behavior)", error);
        return;
      }

      console.error("eventsource error:", error);
      setError("connection lost - please refresh the page");
      eventSource.close();
    };

    eventSource.onopen = () => {
      console.log("eventsource connection opened");
      setError(null);
      retryCount.current = 0;
    };
  };

  useEffect(() => {
    setupEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setOsType(platform());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (selectionRange) {
          handleAskAI();
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (isAiPanelExpanded && aiInput.trim()) {
          handleAiSubmit(e as unknown as React.FormEvent);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionRange, isAiPanelExpanded, aiInput]);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;

    setIsDragging(true);
    setDragStart(percentage);
    setIsAiPanelExpanded(false);

    // Set initial selection range
    const totalMinutesInDay = 24 * 60;
    const minutes = (percentage / 100) * totalMinutesInDay;
    const date = new Date();
    date.setHours(Math.floor(minutes / 60), Math.floor(minutes % 60), 0, 0);

    setSelectionRange({
      start: date,
      end: date,
    });
  };

  const debouncedMouseMove = useMemo(
    () =>
      throttle(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (!isDragging || dragStart === null || !e.currentTarget) return;

          const rect = e.currentTarget.getBoundingClientRect();
          const moveX = e.clientX - rect.left;
          const percentage = (moveX / rect.width) * 100;

          const totalMinutesInDay = 24 * 60;
          const startMinutes =
            (Math.min(dragStart, percentage) / 100) * totalMinutesInDay;
          const endMinutes =
            (Math.max(dragStart, percentage) / 100) * totalMinutesInDay;

          const startLocal = new Date();
          startLocal.setHours(
            Math.floor(startMinutes / 60),
            Math.floor(startMinutes % 60),
            0,
            0
          );

          const endLocal = new Date();
          endLocal.setHours(
            Math.floor(endMinutes / 60),
            Math.floor(endMinutes % 60),
            0,
            0
          );

          setSelectionRange({
            start: startLocal,
            end: endLocal,
          });
        },
        16 // ~60fps
      ),
    [isDragging, dragStart]
  );

  const debouncedScroll = useMemo(
    () =>
      throttle((e: React.WheelEvent<HTMLDivElement>) => {
        const isWithinAiPanel = aiPanelRef.current?.contains(e.target as Node);
        if (isWithinAiPanel) return;

        e.preventDefault();
        e.stopPropagation();

        const scrollSensitivity = 1;
        const delta = -Math.sign(e.deltaY) / scrollSensitivity;

        const newIndex = Math.min(
          Math.max(
            0,
            currentIndex + (delta > 0 ? Math.ceil(delta) : Math.floor(delta))
          ),
          frames.length - 1
        );

        if (newIndex !== currentIndex) {
          setCurrentIndex(newIndex);
          setCurrentFrame(frames[newIndex].devices[0]);
        }
      }, 16),
    [currentIndex, frames]
  );

  const handleTimelineMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);

      // Only show AI panel if we have a meaningful selection
      // if (
      //   selectionRange &&
      //   selectionRange.start.getTime() !== selectionRange.end.getTime()
      // ) {
      //   setIsAiPanelExpanded(true);
      // }
    }
  };

  const handleAskAI = () => {
    posthog.capture("timeline_toggle_ai_panel", {
      action: isAiPanelExpanded ? "close" : "open",
    });

    if (isAiPanelExpanded) {
      setChatMessages([]);
      setIsAiPanelExpanded(false);
      setAiInput("");
    } else {
      setChatMessages([]);
      setIsAiPanelExpanded(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    posthog.capture("timeline_ai_chat", {
      ai_url: settings.aiUrl,
      model: settings.aiModel,
      agent: selectedAgent.name,
      selection_range_minutes: selectionRange
        ? Math.round(
            (selectionRange.end.getTime() - selectionRange.start.getTime()) /
              60000
          )
        : 0,
      // Don't include actual messages/content
    });

    e.preventDefault();
    if (!aiInput.trim() || !selectionRange) return;

    const relevantFrames = frames.filter((frame) => {
      const frameTime = new Date(frame.timestamp);
      return (
        frameTime >= selectionRange.start && frameTime <= selectionRange.end
      );
    });

    const contextData = selectedAgent.dataSelector(relevantFrames);

    const userMessage = {
      id: generateId(),
      role: "user" as const,
      content: aiInput,
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setAiInput("");
    setIsAiLoading(true);

    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant specialized as a "${
            selectedAgent.name
          }" analyzing screen & mic recordings.
            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset: ${new Date().getTimezoneOffset()}
            - All timestamps in the context data are in UTC
            - Convert timestamps to local time for human-readable responses
            - Never output UTC time unless explicitly asked
            - Focus on ${selectedAgent.description}
            - Follow the user's instructions carefully & to the letter: ${
              settings.customPrompt
            }
            `,
        },
        ...chatMessages,
        {
          role: "user" as const,
          content: `Context data: ${JSON.stringify(contextData)}
          
          ${aiInput}`,
        },
      ];

      console.log(
        "messages",
        messages.findLast((m) => m.role === "user")?.content
      );

      abortControllerRef.current = new AbortController();
      setIsStreaming(true);

      const stream = await openai.chat.completions.create(
        {
          model: settings.aiModel,
          messages: messages as ChatCompletionMessageParam[],
          stream: true,
        },
        {
          signal: abortControllerRef.current.signal,
        }
      );

      let fullResponse = "";
      setChatMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: "" },
      ]);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          { id: generateId(), role: "assistant", content: fullResponse },
        ]);
      }
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      // if its max context error, show a different message
      if (error.message.toLowerCase().includes("maximum context")) {
        toast({
          title: "error",
          description:
            "failed to generate AI response. max context length exceeded.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "error",
          description: "failed to generate AI response. please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsAiLoading(false);
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    const preventScroll = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // Add more comprehensive scroll prevention
    document.addEventListener("wheel", preventScroll, { passive: false });
    return () => document.removeEventListener("wheel", preventScroll);
  }, []);

  const handlePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingPanel(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handlePanelMouseMove = (e: React.MouseEvent) => {
    if (isDraggingPanel) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handlePanelMouseUp = () => {
    if (isDraggingPanel) {
      setIsDraggingPanel(false);
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingPanel) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragStart(null);
      }
    };

    if (isDraggingPanel) {
      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDraggingPanel, dragOffset]);

  const handleRefresh = () => {
    posthog.capture("timeline_refresh");
    setupEventSource();
  };

  const handleAgentChange = (agentId: string) => {
    const newAgent = AGENTS.find((a) => a.id === agentId) || AGENTS[0];
    posthog.capture("timeline_change_agent", {
      agent: newAgent.name,
    });
    setSelectedAgent(newAgent);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = chatWindowSize.width;
    const startHeight = chatWindowSize.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, startWidth + moveEvent.clientX - startX); // Minimum width
      const newHeight = Math.max(200, startHeight + moveEvent.clientY - startY); // Minimum height
      setChatWindowSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const loadAppIcon = async (appName: string, appPath?: string) => {
    if (iconCache[appName]) return;

    const icon = await invoke<{ base64: string; path: string } | null>(
      "get_app_icon",
      {
        appName,
        appPath,
      }
    );

    if (icon) {
      setIconCache((prev) => ({
        ...prev,
        [appName]: icon.base64,
      }));
    }
  };

  useEffect(() => {
    const p = platform();
    if (p !== "macos") return;
    frames.forEach((frame) => {
      frame.devices.forEach((device) => {
        loadAppIcon(device.metadata.app_name);
      });
    });
  }, [frames]);

  useEffect(() => {
    const cleanup = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };

    window.addEventListener("beforeunload", cleanup);
    return () => {
      cleanup();
      window.removeEventListener("beforeunload", cleanup);
    };
  }, []);

  useEffect(() => {
    return () => {
      debouncedMouseMove.cancel();
      debouncedScroll.cancel();
    };
  }, [debouncedMouseMove, debouncedScroll]);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden relative"
      onWheel={debouncedScroll}
      style={{
        height: "100vh",
        overscrollBehavior: "none",
        overflow: "hidden",
        WebkitUserSelect: "none",
        userSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
    >
      <button
        onClick={handleRefresh}
        className="absolute top-4 right-4 p-2 text-foreground hover:text-foreground/70 bg-background rounded border border-muted-foreground hover:border-foreground/50 transition-colors z-50"
      >
        <RotateCcw className="h-4 w-4" />
      </button>

      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)",
        }}
      />

      <div className="flex-1 relative min-h-0">
        {(isLoading || frames.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-background/90 p-5 border rounded-lg shadow-lg text-center">
              <p>loading frames...</p>
              <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />
            </div>
          </div>
        )}
        {error && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-destructive/10 p-5 border-destructive/20 border rounded-lg text-destructive">
              <AlertCircle className="h-4 w-4 mb-2 mx-auto" />
              <p>{error}</p>
            </div>
          </div>
        )}
        {currentFrame && (
          <img
            src={`data:image/png;base64,${currentFrame.frame}`}
            className="absolute inset-0 w-full h-full object-contain mx-auto mt-6"
            alt="Current frame"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>

      <div className="w-4/5 mx-auto my-8 relative select-none">
        <div
          className="h-[60px] bg-card border rounded-lg shadow-sm relative overflow-hidden"
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={debouncedMouseMove}
          onMouseUp={handleTimelineMouseUp}
          onMouseLeave={handleTimelineMouseUp}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,255,0,0.1) 1px, transparent 1px)",
              backgroundSize: "10% 100%",
            }}
          />
          <TimelineBlocks frames={frames} timeRange={timelineRange} />

          <CurrentTimeIndicator
            currentFrame={currentFrame}
            frames={frames}
            currentIndex={currentIndex}
            timeRange={timelineRange}
          />

          {/* <TimelineIconsSection blocks={appRanges} /> */}

          <TimeLabels timeRange={timelineRange} />
        </div>
      </div>

      <div className="h-12" />

      <div className="fixed left-12 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        <div className="flex flex-col items-center gap-1">
          <span>▲</span>
          <span>scroll</span>
          <span>▼</span>
        </div>
      </div>

      {selectionRange && (
        <div
          className="absolute top-0 h-full bg-foreground/10"
          style={{
            left: `${
              (new Date(selectionRange.start).getHours() * 3600 +
                new Date(selectionRange.start).getMinutes() * 60) /
              864
            }%`,
            width: `${
              ((selectionRange.end.getTime() - selectionRange.start.getTime()) /
                (24 * 3600 * 1000)) *
              100
            }%`,
          }}
        />
      )}

      {selectionRange && (
        <div
          ref={aiPanelRef}
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: chatWindowSize.width,
            height: isAiPanelExpanded ? chatWindowSize.height : 120,
            cursor: isDraggingPanel ? "grabbing" : "default",
          }}
          className={`bg-background border border-muted-foreground rounded-lg shadow-lg transition-all duration-300 ease-in-out z-[100]`}
        >
          <div
            className="select-none cursor-grab active:cursor-grabbing"
            onMouseDown={handlePanelMouseDown}
            onMouseMove={handlePanelMouseMove}
            onMouseUp={handlePanelMouseUp}
            onMouseLeave={handlePanelMouseUp}
          >
            <div className="p-4 border-b border-muted-foreground flex justify-between items-center group">
              <div className="flex items-center gap-2 flex-1">
                <GripHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                <div className="text-muted-foreground text-xs">
                  {new Date(
                    selectionRange.start.getTime()
                  ).toLocaleTimeString()}{" "}
                  -{" "}
                  {new Date(selectionRange.end.getTime()).toLocaleTimeString()}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectionRange(null);
                  setIsAiPanelExpanded(false);
                  setChatMessages([]);
                  setAiInput("");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors ml-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isAiPanelExpanded && (
              <div className="p-4">
                <button
                  className="px-3 py-1 bg-background hover:bg-accent border text-foreground text-xs rounded flex items-center gap-2 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAiPanelExpanded(true);
                    setTimeout(() => {
                      inputRef.current?.focus();
                    }, 100);
                  }}
                >
                  <span>ask ai</span>
                  <span className="text-muted-foreground text-[10px]">
                    {osType === "macos" ? "⌘K" : "Ctrl+K"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {isAiPanelExpanded && (
            <div className="flex flex-col h-[calc(100%-52px)]">
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 hover:cursor-auto text-foreground font-mono text-sm leading-relaxed"
                style={{
                  WebkitUserSelect: "text",
                  userSelect: "text",
                  MozUserSelect: "text",
                  msUserSelect: "text",
                  overscrollBehavior: "contain",
                }}
              >
                {chatMessages.map((msg, index) => (
                  <ChatMessage key={index} message={msg} />
                ))}
                {isAiLoading && (
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                  </div>
                )}
              </div>

              <form
                onSubmit={handleAiSubmit}
                className="p-3 border-t border-muted-foreground"
              >
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedAgent.id}
                    onChange={(e) => handleAgentChange(e.target.value)}
                    className="w-full bg-background border border-muted-foreground text-foreground rounded px-2 py-1 text-xs"
                  >
                    {AGENTS.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                        className="bg-background text-foreground"
                      >
                        {agent.name} - {agent.description}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="ask about this time range..."
                      className="flex-1 bg-background border border-muted-foreground text-foreground placeholder-muted-foreground"
                      disabled={isAiLoading}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="hover:bg-accent transition-colors"
                      disabled={isAiLoading}
                    >
                      {isStreaming ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div
            ref={resizerRef}
            onMouseDown={handleMouseDown}
            className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent"
            style={{
              borderTopLeftRadius: "4px",
              borderBottomRightRadius: "4px",
              cursor: "se-resize",
            }}
          />
        </div>
      )}
    </div>
  );
}
