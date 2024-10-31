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
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const maxRetries = 3;
  const retryCount = useRef(0);

  const setupEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
    const url = `http://localhost:3030/stream/frames?start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&fps=1&reverse=true`;

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
        console.log("stream ended (expected behavior)");
        setIsLoading(false);
        return;
      }

      console.error("eventsource error:", error);
      setError("connection lost. retrying...");

      eventSource.close();

      if (retryCount.current < maxRetries) {
        retryTimeoutRef.current = setTimeout(() => {
          retryCount.current += 1;
          console.log(
            `retrying connection (${retryCount.current}/${maxRetries})...`
          );
          setupEventSource();
        }, 2000 * Math.pow(2, retryCount.current)); // Exponential backoff
      } else {
        setError(
          "failed to connect after multiple attempts. please refresh the page."
        );
        setIsLoading(false);
      }
    };

    eventSource.onopen = () => {
      console.log("eventsource connection opened");
      setError(null);
      retryCount.current = 0;
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

    const delta = Math.sign(e.deltaY);
    const newIndex = Math.min(
      Math.max(0, currentIndex + delta),
      frames.length - 1
    );

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      setCurrentFrame(frames[newIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-black text-white overflow-hidden font-['Press_Start_2P'] relative"
      onWheel={handleScroll}
      style={{
        height: "100vh",
        overscrollBehavior: "none", // Prevent bounce/overscroll effects
      }}
    >
      {/* Scanline effect overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)",
          imageRendering: "pixelated",
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
          <img
            src={`data:image/png;base64,${currentFrame.frame}`}
            className="absolute inset-0 w-4/5 h-auto max-h-[80vh] object-contain mx-auto mt-8 border-4 border-[#333] shadow-[0_0_16px_rgba(255,255,255,0.1)]"
            style={{ imageRendering: "pixelated" }}
            alt="Current frame"
          />
        )}
      </div>

      {/* Info text */}
      <div className="text-center text-[#888] text-xs tracking-wider my-5">
        {currentFrame && (
          <span>
            timestamp: {new Date(currentFrame.timestamp).toLocaleString()} |
            app: {currentFrame?.app_name || "n/a"} | window:{" "}
            {currentFrame?.window_name || "n/a"}
          </span>
        )}
      </div>

      {/* Timeline bar */}
      <div className="w-4/5 mx-auto mb-8 relative">
        <div
          className="h-[60px] bg-[#111] border-4 border-[#444] shadow-[0_0_16px_rgba(0,0,0,0.8),inset_0_0_8px_rgba(255,255,255,0.1)] cursor-crosshair relative"
          style={{ imageRendering: "pixelated" }}
        >
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
            className="absolute top-0 h-full w-1 bg-[#0f0] shadow-[0_0_12px_#0f0] opacity-80"
            style={{
              left: `${(currentIndex / Math.max(frames.length - 1, 1)) * 100}%`,
            }}
          />
        </div>

        {/* Timeline timestamps */}
        <div className="relative mt-1 px-2 text-[10px] text-[#0f0] shadow-[0_0_8px_#0f0]">
          {frames.length > 0 &&
            Array(5)
              .fill(0)
              .map((_, i) => {
                const position = i / 4;
                const frameIndex = Math.floor(position * (frames.length - 1));
                return (
                  <div
                    key={i}
                    className="absolute transform -translate-x-1/2"
                    style={{ left: `${position * 100}%` }}
                  >
                    {new Date(
                      frames[frameIndex]?.timestamp
                    ).toLocaleTimeString()}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
