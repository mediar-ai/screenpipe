import { useRef, useState } from "react";
import { generateId, Message } from "ai";
import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { Loader2, Send, Square, X, GripHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat-message-v2";
import { useToast } from "@/components/ui/use-toast";

interface Agent {
  id: string;
  name: string;
  description: string;
  dataSelector: (frames: any[]) => any;
}

interface ChatPanelProps {
  position: { x: number; y: number };
  size: { width: number; height: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
  onClose: () => void;
  isExpanded: boolean;
  onExpand: () => void;
  selectionRange: { start: Date; end: Date };
  frames: any[];
  settings: any;
  agents: Agent[];
  osType: string;
}

export function ChatPanel({
  position,
  size,
  onPositionChange,
  onSizeChange,
  onClose,
  isExpanded,
  onExpand,
  selectionRange,
  frames,
  settings,
  agents,
  osType,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Dragging logic
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handlePanelMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      onPositionChange({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handlePanelMouseUp = () => {
    setIsDragging(false);
  };

  // Resizing logic
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, startWidth + moveEvent.clientX - startX);
      const newHeight = Math.max(200, startHeight + moveEvent.clientY - startY);
      onSizeChange({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const relevantFrames = frames.filter((frame) => {
      const frameTime = new Date(frame.timestamp);
      return (
        frameTime >= selectionRange.start && frameTime <= selectionRange.end
      );
    });

    const contextData = selectedAgent.dataSelector(relevantFrames);

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const m: Message[] = [
        {
          id: generateId(),
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
            }`,
        },
        ...messages,
        {
          id: generateId(),
          role: "user" as const,
          content: `Context data: ${JSON.stringify(contextData)}\n${input}`,
        },
      ];

      abortControllerRef.current = new AbortController();
      setIsStreaming(true);

      const stream = await openai.chat.completions.create(
        {
          model: settings.aiModel,
          messages: m as ChatCompletionMessageParam[],
          stream: true,
        },
        {
          signal: abortControllerRef.current.signal,
        }
      );

      let fullResponse = "";
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "assistant", content: "" },
      ]);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { id: generateId(), role: "assistant", content: fullResponse },
        ]);
      }
    } catch (error: any) {
      console.error("error generating ai response:", error);
      toast({
        title: "error",
        description: error.message.toLowerCase().includes("maximum context")
          ? "failed to generate ai response. max context length exceeded."
          : "failed to generate ai response. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: size.width,
        height: isExpanded ? size.height : 120,
        cursor: isDragging ? "grabbing" : "default",
      }}
      className="bg-background border border-muted-foreground rounded-lg shadow-lg transition-all duration-300 ease-in-out z-[100]"
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
              {selectionRange.start.toLocaleTimeString()} -{" "}
              {selectionRange.end.toLocaleTimeString()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isExpanded ? (
          <div className="p-4">
            <button
              className="px-3 py-1 bg-background hover:bg-accent border text-foreground text-xs rounded flex items-center gap-2 transition-colors"
              onClick={onExpand}
            >
              <span>ask ai</span>
              <span className="text-muted-foreground text-[10px]">
                {osType === "macos" ? "⌘K" : "Ctrl+K"}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100%-52px)]">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 hover:cursor-auto text-foreground font-mono text-sm leading-relaxed">
              {messages.map((msg, index) => (
                <ChatMessage key={index} message={msg} />
              ))}
              {isLoading && (
                <div className="flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                </div>
              )}
            </div>

            <div className="mt-auto border-t border-muted-foreground">
              <form onSubmit={handleSubmit} className="p-3">
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedAgent.id}
                    onChange={(e) => {
                      const agent = agents.find((a) => a.id === e.target.value);
                      if (agent) setSelectedAgent(agent);
                    }}
                    className="w-full bg-background text-foreground border border-muted-foreground rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
                  >
                    {agents.map((agent) => (
                      <option
                        key={agent.id}
                        value={agent.id}
                        className="bg-background text-foreground"
                        style={{
                          backgroundColor: "var(--background)",
                          color: "var(--foreground)",
                        }}
                      >
                        {agent.name} - {agent.description}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="ask about this time range..."
                      className="flex-1 bg-background border border-muted-foreground text-foreground placeholder-muted-foreground"
                      disabled={isLoading}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="hover:bg-accent transition-colors"
                      disabled={isLoading}
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
          </div>
        )}
      </div>

      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent"
        style={{
          borderTopLeftRadius: "4px",
          borderBottomRightRadius: "4px",
          cursor: "se-resize",
        }}
      />
    </div>
  );
}
