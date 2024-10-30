"use client";
import { useEffect, useState, useRef, WheelEvent } from "react";

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
    const startTime = new Date(endTime.getTime() - 30 * 60 * 1000);
    const url = `http://localhost:3030/stream/frames?start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}&fps=3&reverse=true`;

    console.log("Starting stream:", url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      setError("Connection lost. Retrying...");

      eventSource.close();

      if (retryCount.current < maxRetries) {
        retryTimeoutRef.current = setTimeout(() => {
          retryCount.current += 1;
          console.log(
            `Retrying connection (${retryCount.current}/${maxRetries})...`
          );
          setupEventSource();
        }, 2000 * Math.pow(2, retryCount.current)); // Exponential backoff
      } else {
        setError(
          "Failed to connect after multiple attempts. Please refresh the page."
        );
        setIsLoading(false);
      }
    };

    eventSource.onopen = () => {
      console.log("EventSource connection opened");
      setError(null);
      retryCount.current = 0;
      setIsLoading(true);
    };

    eventSource.addEventListener("frame", (event) => {
      try {
        const frame = JSON.parse(event.data);
        setFrames((prev) => {
          // Deduplicate frames based on timestamp
          const exists = prev.some((f) => f.timestamp === frame.timestamp);
          if (exists) return prev;
          return [...prev, frame];
        });

        if (!currentFrame) {
          setCurrentFrame(frame);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to parse frame data:", error);
      }
    });
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

  const handleScroll = (e: WheelEvent) => {
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
      className="fixed inset-0 flex flex-col bg-white text-white overflow-hidden"
      onWheel={handleScroll}
      style={{ height: "100vh" }}
    >
      {/* Frame viewer */}
      <div className="flex-1 relative min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-black">
            <p>loading frames...</p>
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
            className="absolute inset-0 w-full h-full object-contain"
            alt="Current frame"
            onError={(e) => console.error("Image load error:", e)}
          />
        )}
      </div>

      {/* Timeline bar */}
      <div className="h-32 flex-none bg-white border-t border-black/10">
        {/* Time and app info */}
        <div className="h-8 px-4 flex items-center justify-between text-sm text-gray-400 border-b border-black/10">
          <span>
            {currentFrame?.timestamp
              ? new Date(currentFrame.timestamp).toLocaleString()
              : "Loading..."}
          </span>
          <span>
            {currentFrame?.app_name}{" "}
            {currentFrame?.window_name ? `- ${currentFrame.window_name}` : ""}
          </span>
        </div>

        {/* Timeline thumbnails */}
        <div className="flex overflow-x-auto h-24 gap-1 p-2 no-scrollbar">
          {frames.map((frame, index) => (
            <div
              key={frame.timestamp}
              className={`flex-none w-32 h-full relative cursor-pointer transition-all ${
                index === currentIndex
                  ? "border-2 border-white"
                  : "border border-white/20"
              }`}
              onClick={() => {
                setCurrentIndex(index);
                setCurrentFrame(frame);
              }}
            >
              <img
                src={`data:image/png;base64,${frame.frame}`}
                className="w-full h-full object-cover"
                alt={`Frame ${index}`}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] p-1 truncate">
                {new Date(frame.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
