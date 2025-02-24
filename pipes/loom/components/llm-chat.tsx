"use client";
import { generateId, Message } from "ai";
import { useToast } from "@/lib/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Send, Square } from "lucide-react";
import { ChatMessage } from "@/components/chat-message";
import { spinner } from "@/components/spinner";
import { useAiProvider } from "@/lib/hooks/use-ai-provider";
import { useSettings } from "@/lib/hooks/use-settings";
import { ContentItem } from "@screenpipe/browser";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LLMChatProps {
  data: ContentItem[] | undefined;
  className?: string;
}

export function LLMChat({ data, className }: LLMChatProps) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const [isLoading, setIsLoading] = useState(false);
  const { isAvailable, error } = useAiProvider(settings);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<Message>>([]);
  const [floatingInput, setFloatingInput] = useState("");
  const [isFloatingInputVisible, setIsFloatingInputVisible] = useState(false);

  const floatingInputRef = useRef<HTMLInputElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollPosition = useRef(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    description: "the raw text you've given is the ocr from a video, analyzes it and create a consise summary for the video",
    systemPrompt: "you can analyze text which is raw ocr of a video and provide comprehensive description for it",
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

    abortControllerRef.current = new AbortController();
    setIsStreaming(true);

    try {
      console.log("LLM DATA", data)
      setIsLoading(true);
      const response = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings,
          chatMessages,
          floatingInput,
          selectedAgent: AGENT,
          data: data,
        }),
        signal: abortControllerRef.current.signal,
      });

      if(!response.ok){
        toast({
          title: "failed to create description",
          description: `error: ${response.statusText}`,
          variant: "destructive",
          duration: 5000,
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      const result = await response.json();
      const fullResponse = result.response;

      setChatMessages((prevMessages) => [
        ...prevMessages.slice(0, -1),
        { id: generateId(), role: "assistant", content: fullResponse },
      ]);

      setIsUserScrolling(false);
      lastScrollPosition.current = window.scrollY;
      scrollToBottom();
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
      setIsLoading(false);
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
    <div className={`w-full max-w-4xl mx-auto p-4 mt-12 ${className}`}>
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
              <TooltipProvider>
                <Tooltip open={!isAvailable}>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex">
                      <Input
                        ref={floatingInputRef}
                        type="text"
                        placeholder="ask a question about the results..."
                        value={floatingInput}
                        disabled={ isAiDisabled || !isAvailable }
                        onChange={(e) => setFloatingInput(e.target.value)}
                        className="flex-1 h-12 focus:outline-none focus:ring-0 border-0 focus:border-black dark:focus:border-white focus:border-b transition-all duration-200"
                      />
                      <Button
                        type="submit"
                        className="w-12 py-[24px]"
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
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-sm text-destructive">{error}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
