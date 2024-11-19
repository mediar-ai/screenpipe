"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Loader2, RotateCcw, AlertCircle } from "lucide-react";
import posthog from "posthog-js";
import { TimelineIconsSection } from "@/components/timeline/timeline-dock-section";
import { AudioTranscript } from "@/components/timeline/audio-transcript";
import { AIPanel } from "@/components/timeline/ai-panel";
import { TimelineProvider } from "@/lib/hooks/use-timeline-selection";
import { throttle } from "lodash";
import { AGENTS } from "@/components/timeline/agents";
import { TimelineSelection } from "@/components/timeline/timeline-selection";

export interface StreamTimeSeriesResponse {
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

export interface AudioData {
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

export default function Timeline() {
  const [currentFrame, setCurrentFrame] = useState<DeviceFrameResponse | null>(
    null
  );
  const [frames, setFrames] = useState<StreamTimeSeriesResponse[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);
  const [loadedTimeRange, setLoadedTimeRange] = useState<TimeRange | null>(
    null
  );
  const { settings } = useSettings();
  const [isAiPanelExpanded, setIsAiPanelExpanded] = useState(false);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    setPosition({
      x: window.innerWidth - 400,
      y: window.innerHeight / 4,
    });
  }, []);

  const setupEventSource = () => {
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
        if (data === "keep-alive-text") {
          setIsLoading(false);
          return;
        }

        if (data.timestamp && data.devices) {
          setFrames((prev) => {
            const exists = prev.some((f) => f.timestamp === data.timestamp);
            if (exists) return prev;

            if (prev.length === 0) {
              const frameTime = new Date(data.timestamp);
              setLoadedTimeRange((current) => {
                if (!current) return null;
                return {
                  ...current,
                  start: frameTime,
                  end: current.end,
                };
              });
              return [data];
            }

            // Find the correct insertion index using binary search
            const timestamp = new Date(data.timestamp).getTime();
            let left = 0;
            let right = prev.length;

            while (left < right) {
              const mid = Math.floor((left + right) / 2);
              const midTimestamp = new Date(prev[mid].timestamp).getTime();

              if (midTimestamp < timestamp) {
                right = mid;
              } else {
                left = mid + 1;
              }
            }

            const newFrames = [...prev];
            newFrames.splice(left, 0, data);
            return newFrames;
          });

          setCurrentFrame((prev) => prev || data.devices[0]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("failed to parse frame data:", error);
      }
    };

    eventSource.onerror = (error) => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("stream ended (expected behavior)", error);
        setIsLoading(false);
        return;
      }

      console.error("eventsource error:", error);
      setError("connection lost. retrying...");
    };

    eventSource.onopen = () => {
      console.log("eventsource connection opened");
      setError(null);
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
      setIsLoading(false);
      setError(null);
    };
  }, []);

  const handleScroll = useMemo(
    () =>
      throttle((e: React.WheelEvent<HTMLDivElement>) => {
        const isWithinAiPanel = document
          .querySelector(".ai-panel")
          ?.contains(e.target as Node);
        const isWithinAudioPanel = document
          .querySelector(".audio-transcript-panel")
          ?.contains(e.target as Node);
        const isWithinTimelineDialog = document
          .querySelector('[role="dialog"]')
          ?.contains(e.target as Node);

        if (isWithinAiPanel || isWithinAudioPanel || isWithinTimelineDialog) {
          e.stopPropagation();
          return;
        }

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
          frames[newIndex] && setCurrentFrame(frames[newIndex].devices[0]);
        }
      }, 16),
    [currentIndex, frames]
  );

  const timePercentage = useMemo(() => {
    if (!frames.length || currentIndex >= frames.length || !loadedTimeRange) {
      return 0;
    }

    const currentFrame = frames[currentIndex];
    if (!currentFrame?.timestamp) {
      return 0;
    }

    const frameTime = new Date(currentFrame.timestamp);
    const totalVisibleMilliseconds =
      loadedTimeRange.end.getTime() - loadedTimeRange.start.getTime();
    const currentMilliseconds =
      frameTime.getTime() - loadedTimeRange.start.getTime();

    return (currentMilliseconds / totalVisibleMilliseconds) * 100;
  }, [currentIndex, frames, loadedTimeRange]);

  useEffect(() => {
    const preventScroll = (e: WheelEvent) => {
      const isWithinAiPanel = document
        .querySelector(".ai-panel")
        ?.contains(e.target as Node);
      const isWithinAudioPanel = document
        .querySelector(".audio-transcript-panel")
        ?.contains(e.target as Node);
      const isWithinTimelineDialog = document
        .querySelector('[role="dialog"]')
        ?.contains(e.target as Node);

      if (!isWithinAiPanel && !isWithinAudioPanel && !isWithinTimelineDialog) {
        e.preventDefault();
      }
    };

    document.addEventListener("wheel", preventScroll, { passive: false });
    return () => document.removeEventListener("wheel", preventScroll);
  }, []);

  const handleRefresh = () => {
    posthog.capture("timeline_refresh");

    window.location.reload();
    setFrames([]);
    setCurrentFrame(null);
    setCurrentIndex(0);
    setIsLoading(true);
    setupEventSource();
  };

  return (
    <TimelineProvider>
      <div
        className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden relative"
        onWheel={(e) => {
          const isWithinAiPanel = aiPanelRef.current?.contains(
            e.target as Node
          );
          if (!isWithinAiPanel) {
            handleScroll(e);
          }
        }}
        style={{
          height: "100vh",
          overscrollBehavior: "none",
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

        <div className="flex-1 relative min-h-0">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-background/90 p-5 border rounded-lg shadow-lg text-center">
                <p>loading frames...</p>
                <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />
              </div>
            </div>
          )}
          {error && (
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
              className="absolute inset-0 w-4/5 h-auto max-h-[75vh] object-contain mx-auto border rounded-xl p-2 mt-2"
              alt="Current frame"
            />
          )}
          {currentFrame && (
            <AudioTranscript
              frames={frames}
              currentIndex={currentIndex}
              groupingWindowMs={30000} // 30 seconds window
            />
          )}
        </div>

        <div className="w-4/5 mx-auto my-8 relative select-none">
          <div className="h-[60px] bg-card border rounded-lg shadow-sm cursor-crosshair relative">
            {loadedTimeRange && (
              <TimelineSelection loadedTimeRange={loadedTimeRange} />
            )}
            <div
              className="absolute top-0 h-full w-1 bg-foreground/50 shadow-sm opacity-80 z-10"
              style={{ left: `${timePercentage}%` }}
            >
              <div className="relative -top-6 right-3 text-[10px] text-muted-foreground whitespace-nowrap">
                {currentIndex < frames.length &&
                  frames[currentIndex] &&
                  frames[currentIndex].timestamp &&
                  (() => {
                    try {
                      return new Date(
                        frames[currentIndex].timestamp
                      ).toLocaleTimeString(
                        "en-US", // explicitly specify locale
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        }
                      );
                    } catch (e) {
                      console.error("failed to format timestamp:", e);
                      return frames[currentIndex].timestamp; // fallback to raw timestamp
                    }
                  })()}
              </div>
            </div>
          </div>

          <AIPanel
            position={position}
            onPositionChange={setPosition}
            onClose={() => {
              setIsAiPanelExpanded(false);
            }}
            frames={frames}
            agents={AGENTS}
            settings={settings}
            isExpanded={isAiPanelExpanded}
            onExpandedChange={setIsAiPanelExpanded}
          />

          {loadedTimeRange && frames.length > 0 && (
            <TimelineIconsSection blocks={frames} />
          )}

          <div className="relative mt-1 px-2 text-[10px] text-muted-foreground select-none">
            {Array(7)
              .fill(0)
              .map((_, i) => {
                if (!loadedTimeRange) return null;
                const totalMinutes =
                  (loadedTimeRange.end.getTime() -
                    loadedTimeRange.start.getTime()) /
                  (1000 * 60);
                const minutesPerStep = totalMinutes / 6;
                const date = new Date(
                  loadedTimeRange.start.getTime() +
                    i * minutesPerStep * 60 * 1000
                );
                return (
                  <div
                    key={i}
                    className="absolute transform -translate-x-1/2"
                    style={{ left: `${(i * 100) / 6}%` }}
                  >
                    {date.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="fixed left-12 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1">
            <span>▲</span>
            <span>scroll</span>
            <span>▼</span>
          </div>
        </div>
      </div>
    </TimelineProvider>
  );
}
