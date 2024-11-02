"use client";
import { useEffect, useState, useRef } from "react";

interface StreamFramesResponse {
  frame: string;
  timestamp: string;
  file_path: string;
  app_name?: string;
  window_name?: string;
}

export default function Timeline() {
  const [currentFrame, setCurrentFrame] = useState<StreamFramesResponse | null>(
    null
  );
  const [frames, setFrames] = useState<StreamFramesResponse[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedTimeRange, setLoadedTimeRange] = useState<{start: Date, end: Date} | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);

  const setupEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // now minus 2 minutes
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() - 2);
    // at 00.01 am today
    const startTime = new Date();
    startTime.setHours(0, 1, 0, 0);
    const url = `http://localhost:3030/stream/frames?start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&order=descending`;

    // Set the initial loaded time range
    setLoadedTimeRange({
      start: startTime,
      end: endTime
    });

    console.log("starting stream:", url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame === "keep-alive-text" || !frame.frame) return;

        setFrames((prev) => {
          // Deduplicate frames based on timestamp
          const exists = prev.some((f) => f.timestamp === frame.timestamp);
          if (exists) return prev;
          return [...prev, frame];
        });

        // Only set current frame and loading state if it's our first frame
        setCurrentFrame((prev) => prev || frame);
        setIsLoading(false);
      } catch (error) {
        console.error("failed to parse frame data:", error);
      }
    };

    eventSource.onerror = (error) => {
      // Ignore end of stream errors (expected behavior)
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("stream ended (expected behavior)", error);
        setIsLoading(false);
        return;
      }

      console.error("eventsource error:", error);
      setError("connection lost. retrying...");

      eventSource.close();
    };

    eventSource.onopen = () => {
      console.log("eventsource connection opened");
      setError(null);
      retryCount.current = 0;
    };
  };

  const getLoadedTimeRangeStyles = () => {
    if (!loadedTimeRange) return { left: '0%', right: '100%' };
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    const totalMs = endOfDay.getTime() - startOfDay.getTime();
    const startPercent = ((loadedTimeRange.start.getTime() - startOfDay.getTime()) / totalMs) * 100;
    const endPercent = ((loadedTimeRange.end.getTime() - startOfDay.getTime()) / totalMs) * 100;
    
    return {
      left: `${startPercent}%`,
      right: `${100 - endPercent}%`
    };
  };

  useEffect(() => {
    setupEventSource();

    // Update the type annotation to use the DOM's WheelEvent
    const preventScroll = (e: globalThis.WheelEvent) => {
      e.preventDefault();
    };

    document.addEventListener("wheel", preventScroll, { passive: false });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      document.removeEventListener("wheel", preventScroll);
    };
  }, []);

  const handleScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Add a sensitivity factor to slow down scrolling (higher = slower)
    const scrollSensitivity = 1;
    // Negate the delta to invert the scrolling direction
    const delta = -Math.sign(e.deltaY) / scrollSensitivity;

    // Use Math.floor or Math.ceil depending on scroll direction to ensure we don't get stuck
    const newIndex = Math.min(
      Math.max(
        0,
        currentIndex + (delta > 0 ? Math.ceil(delta) : Math.floor(delta))
      ),
      frames.length - 1
    );

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      setCurrentFrame(frames[newIndex]);
    }
  };

  const getCurrentTimePercentage = () => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const totalDayMilliseconds = endOfDay.getTime() - startOfDay.getTime();
    const currentMilliseconds = now.getTime() - startOfDay.getTime();

    return (currentMilliseconds / totalDayMilliseconds) * 100;
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-black text-white overflow-hidden font-['Press_Start_2P'] relative"
      onWheel={handleScroll}
      style={{
        height: "100vh",
        overscrollBehavior: "none",
      }}
    >
      {/* Scanline effect overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)",
        }}
      />

      {/* Frame viewer */}
      <div className="flex-1 relative min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/90 p-5 border-4 border-[#333] shadow-2xl text-center">
              <p>loading frames...</p>
              <div className="animate-blink inline-block w-2 h-2 bg-white ml-1" />
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            <p>{error}</p>
          </div>
        )}
        {currentFrame && (
          <>
            {/* App info centered above frame */}
            <div className="w-4/5 mx-auto mt-4 mb-4 text-center">
              <div className="inline-block bg-black/50 p-2 rounded shadow-lg backdrop-blur-sm border border-[#333] text-[#888] text-xs tracking-wider">
                <div className="flex items-center gap-4">
                  <div>{new Date(currentFrame?.timestamp).toLocaleTimeString()}</div>
                  <div>app: {currentFrame?.app_name || "n/a"}</div>
                  <div>window: {currentFrame?.window_name || "n/a"}</div>
                </div>
              </div>
            </div>
            <img
              src={`data:image/png;base64,${currentFrame.frame}`}
              className="absolute inset-0 w-4/5 h-auto max-h-[75vh] object-contain mx-auto mt-12"
              alt="Current frame"
            />
          </>
        )}
      </div>

      {/* Timeline bar */}
      <div className="w-4/5 mx-auto my-8 relative">
        <div className="h-[60px] bg-[#111] border-4 border-[#444] shadow-[0_0_16px_rgba(0,0,0,0.8),inset_0_0_8px_rgba(255,255,255,0.1)] cursor-crosshair relative">
          {/* Unloaded regions overlay - making it more visible with a different color and opacity */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              ...getLoadedTimeRangeStyles(),
              background: 'linear-gradient(to right, rgba(255,255,255,0.8), rgba(255,255,255,0.2))'
            }}
          />

          {/* Grid lines */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,255,0,0.1) 1px, transparent 1px)",
              backgroundSize: "10% 100%",
            }}
          />

          {/* Current position indicator */}
          <div
            className="absolute top-0 h-full w-1 bg-[#0f0] shadow-[0_0_12px_#0f0] opacity-80 z-10"
            style={{
              left: `${getCurrentTimePercentage()}%`,
            }}
          />
        </div>

        {/* Timeline timestamps */}
        <div className="relative mt-1 px-2 text-[10px] text-[#0f0] shadow-[0_0_8px_#0f0]">
          {Array(7)
            .fill(0)
            .map((_, i) => {
              const hour = (i * 4) % 24; // Start at 0 and increment by 4 hours

              return (
                <div
                  key={i}
                  className="absolute transform -translate-x-1/2"
                  style={{ left: `${(i * 100) / 6}%` }}
                >
                  {`${hour.toString().padStart(2, "0")}:00`}
                </div>
              );
            })}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="fixed left-12 top-1/2 -translate-y-1/2 font-['Press_Start_2P'] text-xs text-[#0f0] animate-pulse">
        <div className="flex flex-col items-center gap-1">
          <span>▲</span>
          <span className="tracking-wider">scroll</span>
          <span>▼</span>
        </div>
      </div>
    </div>
  );
}
