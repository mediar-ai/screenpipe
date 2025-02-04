import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, Send, Square } from "lucide-react";
import { OpenAI } from "openai";
import { useToast } from "@/lib/use-toast";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { generateId, Message } from "ai";
import { ChatMessage } from "@/components/chat-message";
import { spinner } from "@/components/spinner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { useSettings } from "@/lib/hooks/use-settings";
import { log } from "console";

interface RawInfo {
  frame_id: number;
  text: string;
  timestamp: string;
  file_path: string;
  offset_index: number;
  app_name: string;
  window_name: string;
  tags: string[];
  frame: any;
}

interface Data {
  type: string;
  content: RawInfo;
}

interface LLMChatProps {
  data: Data[];
  className?: string;
}

export function LLMChat({ data, className }: LLMChatProps) {

  const { toast } = useToast();
  const { health } = useHealthCheck();
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useSettings();
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<Message>>([]);
  const [floatingInput, setFloatingInput] = useState("");
  const [isFloatingInputVisible, setIsFloatingInputVisible] = useState(false);

  const floatingInputRef = useRef<HTMLInputElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollPosition = useRef(0);

  const MAX_CONTENT_LENGTH = settings.aiMaxContextChars;

  const [similarityThreshold, setSimilarityThreshold] = useState(1);


  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const debouncedThreshold = useDebounce(similarityThreshold, 300);



  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPosition = window.scrollY;

      const scrollPercentage =
        (currentScrollPosition /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;

      const shouldShow = scrollPercentage < 90;
      setShowScrollButton(shouldShow);

      if (isAiLoading && currentScrollPosition < lastScrollPosition.current) {
        setIsUserScrolling(true);
      }

      lastScrollPosition.current = currentScrollPosition;
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isAiLoading]);

  const scrollToBottom = () => {
    if (!isUserScrolling) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        setIsFloatingInputVisible(true);
      } else if (event.key === "Escape") {
        setIsFloatingInputVisible(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isFloatingInputVisible && floatingInputRef.current) {
      floatingInputRef.current.focus();
    }
  }, [isFloatingInputVisible]);


  const removeDuplicateLines = (textContent: string[])  => {
    const uniqueLines = Array.from(new Set(textContent));
    if (uniqueLines.length > MAX_CONTENT_LENGTH) {
      return uniqueLines.slice(0, MAX_CONTENT_LENGTH)
    }
    return uniqueLines;
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setIsAiLoading(false);
    }
  };

  const AGENT = {
    id: "description",
    name: "description generator",
    description: "analyzes the given text and generate description for the video.",
    systemPrompt:
    "you can analyze text which is raw information about a video and provide comprehensive insights.",
  }

  const handleFloatingInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floatingInput.trim() && !isStreaming) return;

    if (isStreaming) {
      handleStopStreaming();
      return;
    }

    scrollToBottom();

    const userMessage = {
      id: generateId(),
      role: "user" as const,
      content: floatingInput,
    };
    setChatMessages((prevMessages) => [
      ...prevMessages,
      userMessage,
      { id: generateId(), role: "assistant", content: "" },
    ]);
    setFloatingInput("");
    setIsAiLoading(true);

    try {
      const openai = new OpenAI({
        apiKey:
          settings.aiProviderType === "screenpipe-cloud"
            ? settings.user.token
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });
      console.log("API settings", settings.openaiApiKey, settings.aiUrl);


      // - ${customPrompt ? `Custom prompt: ${customPrompt}` : ""}
      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";
      const context = removeDuplicateLines(data.map(item => item.content.text))
      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant specialized as a "${ AGENT.name }". ${AGENT.systemPrompt }
            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset: ${new Date().getTimezoneOffset()}
            - ${customPrompt ? `Custom prompt: ${customPrompt}` : ""}
            - A same lines can be repeat multiple times, you can ignore the duplicate lines
            - You can ignore the context if user's question is differnet from context as an example user says "hi"
            `,
        },
        ...chatMessages.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: `Context data: ${context}
          User query: ${floatingInput}`,
        },
      ];
      console.log("Messages:", messages);

      abortControllerRef.current = new AbortController();
      setIsStreaming(true);

      const stream = await openai.chat.completions.create(
        {
          model: model,
          messages: messages,
          stream: true,
        },
        {
          signal: abortControllerRef.current.signal,
          // headers: {
          //   Authorization: `Bearer ${settings.user?.token}`,
          // },
        }
      );

      let fullResponse = "";
      // @ts-ignore
      setChatMessages((prevMessages) => [
        ...prevMessages.slice(0, -1),
        { id: generateId(), role: "assistant", content: fullResponse },
      ]);

      setIsUserScrolling(false);
      lastScrollPosition.current = window.scrollY;
      scrollToBottom();

      for await (const chunk of stream) {
        console.log("chunk", chunk);
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        // @ts-ignore
        setChatMessages((prevMessages) => [
          ...prevMessages.slice(0, -1),
          { id: generateId(), role: "assistant", content: fullResponse },
        ]);
        scrollToBottom();
      }
    } catch (error: any) {
      if (error.toString().includes("unauthorized")) {
        toast({
          title: "Error",
          description: "Please sign in to use AI features",
          variant: "destructive",
        });
      } else if (error.toString().includes("aborted")) {
        console.log("Streaming was aborted");
      } else {
        console.error("Error generating AI response:", error);
        toast({
          title: "Error",
          description: "Failed to generate AI response. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsAiLoading(false);
      setIsFloatingInputVisible(false);
      setIsStreaming(false);
      if (!isUserScrolling) {
        scrollToBottom();
      }
    }
  };

  const isAiDisabled =
    !settings.user?.token && settings.aiProviderType === "screenpipe-cloud";

  return (
    <div className="w-full max-w-4xl mx-auto p-4 mt-12">
      {isLoading && (
        <div className="my-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-0 right-0 mx-auto w-full max-w-2xl z-50"
        >
          <form
            onSubmit={handleFloatingInputSubmit}
            className="flex flex-col space-y-2 bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="relative flex-grow flex items-center space-x-2">
              <Input
                ref={floatingInputRef}
                type="text"
                placeholder="put prompt to generate description..."
                value={floatingInput}
                onChange={(e) => setFloatingInput(e.target.value)}
                className="flex-1 h-12 focus:outline-none focus:ring-0 border focus:border-black dark:focus:border-white focus:border-b transition-all duration-200"
              />
              <Button
                type="submit"
                className="w-12"
                title={
                  isAiDisabled
                    ? "Please sign in to use AI features"
                    : undefined
                }
              >
                {isStreaming ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>

      {(chatMessages.length > 0 || isAiLoading) && (
        <>
          <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto">
            {chatMessages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}
            {isAiLoading && spinner}
          </div>
        </>
      )}

      {showScrollButton && (
        <Button
          className="fixed bottom-4 right-4 rounded-full p-2"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
