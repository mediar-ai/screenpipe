"use client";
import { useEffect, useState, useRef } from "react";
import { OpenAI } from "openai";
import { generateId, Message } from "ai";
import { useSettings } from "@/lib/hooks/use-settings";
import { ChatMessage } from "@/components/chat-message-v2";
import { useToast } from "@/components/ui/use-toast";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { Loader2, Send, Square, X, GripHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { platform } from "@tauri-apps/plugin-os";

interface StreamFramesResponse {
  frame: string;
  timestamp: string;
  file_path: string;
  app_name?: string;
  window_name?: string;
}

interface TimeRange {
  start: Date;
  end: Date;
}

export default function Timeline() {
  const [currentFrame, setCurrentFrame] = useState<StreamFramesResponse | null>(
    null
  );
  const [frames, setFrames] = useState<StreamFramesResponse[]>([]);
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
  const [position, setPosition] = useState({ x: window.innerWidth - 400, y: window.innerHeight / 4 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [osType, setOsType] = useState<string>("");

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
      end: endTime,
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
    if (!loadedTimeRange) return { left: "0%", right: "100%" };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const totalMs = endOfDay.getTime() - startOfDay.getTime();
    const startPercent =
      ((loadedTimeRange.start.getTime() - startOfDay.getTime()) / totalMs) *
      100;
    const endPercent =
      ((loadedTimeRange.end.getTime() - startOfDay.getTime()) / totalMs) * 100;

    return {
      left: `${startPercent}%`,
      right: `${100 - endPercent}%`,
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
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux) to open AI panel
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (selectionRange) {
          handleAskAI();
        }
      }
      
      // Cmd+Enter or Ctrl+Enter to send message
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

  const handleScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    // Check if the event originated from within the AI panel
    const isWithinAiPanel = aiPanelRef.current?.contains(e.target as Node);
    if (isWithinAiPanel) {
      // Allow normal scrolling behavior for AI panel
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

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    setIsDragging(true);
    setDragStart(percentage);

    // Convert percentage to time
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const totalMs = 24 * 60 * 60 * 1000;
    const timeAtClick = new Date(
      startOfDay.getTime() + (totalMs * percentage) / 100
    );

    setSelectionRange({
      start: timeAtClick,
      end: timeAtClick,
    });
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || dragStart === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;

    // Convert percentages to times
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const totalMs = 24 * 60 * 60 * 1000;

    const startTime = new Date(
      startOfDay.getTime() + (totalMs * Math.min(dragStart, percentage)) / 100
    );
    const endTime = new Date(
      startOfDay.getTime() + (totalMs * Math.max(dragStart, percentage)) / 100
    );

    setSelectionRange({
      start: startTime,
      end: endTime,
    });
  };

  const handleTimelineMouseUp = () => {
    setIsDragging(false);
  };

  const handleAskAI = () => {
    setIsAiPanelExpanded(true);
    // Focus the input after a brief delay to allow animation to complete
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || !selectionRange) return;

    const relevantFrames = frames.filter((frame) => {
      const frameTime = new Date(frame.timestamp);
      return (
        frameTime >= selectionRange.start && frameTime <= selectionRange.end
      );
    });

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

      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant analyzing screenpipe recordings.
            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset: ${new Date().getTimezoneOffset()}
            - Very important: follow custom prompt: "${customPrompt}"
            - Perform timezone conversion to UTC before using datetime in tool calls
            - Reformat timestamps to human-readable format in responses
            - Never output UTC time unless explicitly asked
            - Focus on app usage patterns and context switches
            ${customPrompt}`,
        },
        ...chatMessages,
        {
          role: "user" as const,
          content: `Context data: ${JSON.stringify(relevantFrames)}
          
          ${aiInput}`,
        },
      ];

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
      toast({
        title: "Error",
        description: "Failed to generate AI response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
      setIsStreaming(false);
    }
  };

  // Add this to prevent scroll on the document
  useEffect(() => {
    const preventScroll = (e: WheelEvent) => {
      // Check if the event target is within the AI panel
      const isWithinAiPanel = aiPanelRef.current?.contains(e.target as Node);
      if (!isWithinAiPanel) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', preventScroll, { passive: false });
    return () => document.removeEventListener('wheel', preventScroll);
  }, []);

  const handlePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setIsDraggingPanel(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
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
    setIsDraggingPanel(false);
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
      setIsDraggingPanel(false);
    };

    if (isDraggingPanel) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingPanel, dragOffset]);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-black text-white overflow-hidden font-['Press_Start_2P'] relative"
      onWheel={(e) => {
        // Only handle wheel events if they're not from the AI panel
        const isWithinAiPanel = aiPanelRef.current?.contains(e.target as Node);
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
            <div className="w-4/5 mx-auto mt-4 mb-4 text-center select-none">
              <div className="inline-block bg-black/50 p-2 rounded shadow-lg backdrop-blur-sm border border-[#333] text-[#888] text-xs tracking-wider">
                <div className="flex items-center gap-4">
                  <div>
                    {new Date(currentFrame?.timestamp).toLocaleTimeString()}
                  </div>
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
      <div className="w-4/5 mx-auto my-8 relative select-none">
        <div
          className="h-[60px] bg-[#111] border-4 border-[#444] shadow-[0_0_16px_rgba(0,0,0,0.8),inset_0_0_8px_rgba(255,255,255,0.1)] cursor-crosshair relative"
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={handleTimelineMouseMove}
          onMouseUp={handleTimelineMouseUp}
          onMouseLeave={handleTimelineMouseUp}
        >
          {/* Unloaded regions overlay - making it more visible with a different color and opacity */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              ...getLoadedTimeRangeStyles(),
              background:
                "linear-gradient(to right, rgba(255,255,255,0.8), rgba(255,255,255,0.2))",
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

          {/* Selection overlay */}
          {selectionRange && (
            <div
              className="absolute top-0 h-full bg-[#0f0] opacity-20"
              style={{
                left: `${
                  (selectionRange.start.getHours() * 3600 +
                    selectionRange.start.getMinutes() * 60) /
                  864
                }%`,
                width: `${
                  ((selectionRange.end.getTime() -
                    selectionRange.start.getTime()) /
                    (24 * 3600 * 1000)) *
                  100
                }%`,
              }}
            />
          )}
        </div>

        {/* Floating window when selection exists */}
        {selectionRange && (
          <div 
            ref={aiPanelRef}
            onMouseEnter={() => setIsHoveringAiPanel(true)}
            onMouseLeave={() => setIsHoveringAiPanel(false)}
            style={{
              position: 'fixed',
              left: position.x,
              top: position.y,
              cursor: isDraggingPanel ? 'grabbing' : 'grab'
            }}
            className={`w-96 bg-black/90 border-2 border-[#0f0] shadow-[0_0_20px_rgba(0,255,0,0.3)] rounded transition-colors duration-300 ease-in-out z-[100] ${
              isAiPanelExpanded ? 'h-[70vh]' : 'h-auto'
            }`}
          >
            <div 
              className="p-2 border-b border-[#0f0]/20 select-none flex justify-between items-center group"
              onMouseDown={handlePanelMouseDown}
              onMouseMove={handlePanelMouseMove}
              onMouseUp={handlePanelMouseUp}
              onMouseLeave={handlePanelMouseUp}
            >
              <div 
                className="flex items-center gap-2 flex-1 cursor-grab active:cursor-grabbing"
              >
                <GripHorizontal className="w-4 h-4 text-[#0f0]/50 group-hover:text-[#0f0]" />
                <div className="text-[#0f0] text-xs">
                  {selectionRange?.start.toLocaleTimeString()} - {selectionRange?.end.toLocaleTimeString()}
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectionRange(null);
                  setIsAiPanelExpanded(false);
                }} 
                className="text-[#0f0] hover:text-[#0f0]/70 ml-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              {!isAiPanelExpanded && (
                <button 
                  className="px-3 py-1 bg-[#0f0]/20 hover:bg-[#0f0]/30 border border-[#0f0] text-[#0f0] text-xs rounded flex items-center gap-2"
                  onClick={handleAskAI}
                >
                  <span>ask ai</span>
                  <span className="text-[#0f0]/50 text-[10px]">
                    {osType === "macos" ? "⌘K" : "Ctrl+K"}
                  </span>
                </button>
              )}
            </div>

            {isAiPanelExpanded && (
              <div className="flex flex-col h-[calc(100%-100px)]">
                {/* Chat messages - Fixed height and scrollable */}
                <div 
                  className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 hover:cursor-auto text-[#eee] font-mono text-sm leading-relaxed"
                  style={{
                    WebkitUserSelect: "text",
                    userSelect: "text",
                    MozUserSelect: "text",
                    msUserSelect: "text",
                    overscrollBehavior: "contain",
                    textShadow: "0 0 1px rgba(255, 255, 255, 0.5)",
                    letterSpacing: "0.02em"
                  }}
                >
                  {chatMessages.map((msg, index) => (
                    <ChatMessage key={index} message={msg} />
                  ))}
                  {isAiLoading && (
                    <div className="flex justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#0f0]" />
                    </div>
                  )}
                </div>

                {/* Input form */}
                <form 
                  onSubmit={handleAiSubmit}
                  className="p-4 border-t border-[#0f0]/20"
                  style={{
                    WebkitUserSelect: "text",
                    userSelect: "text",
                    MozUserSelect: "text",
                    msUserSelect: "text",
                  }}
                >
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="ask about this time range..."
                      className="flex-1 bg-black/50 border-[#0f0] text-[#0f0] placeholder-[#0f0]/50"
                      disabled={isAiLoading}
                    />
                    <Button 
                      type="submit"
                      disabled={isAiLoading}
                      className="bg-[#0f0]/20 hover:bg-[#0f0]/30 border border-[#0f0] text-[#0f0] group relative"
                    >
                      {isStreaming ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span className="absolute -top-8 right-0 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 px-2 py-1 rounded whitespace-nowrap">
                            {osType === "macos" ? "⌘↵" : "Ctrl+↵"}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Timeline timestamps */}
        <div className="relative mt-1 px-2 text-[10px] text-[#0f0] shadow-[0_0_8px_#0f0] select-none">
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
      <div className="fixed left-12 top-1/2 -translate-y-1/2 font-['Press_Start_2P'] text-xs text-[#0f0] animate-pulse select-none">
        <div className="flex flex-col items-center gap-1">
          <span>▲</span>
          <span className="tracking-wider">scroll</span>
          <span>▼</span>
        </div>
      </div>
    </div>
  );
}
