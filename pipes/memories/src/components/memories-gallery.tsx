"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { pipe, ContentItem } from "@screenpipe/browser";
import { VideoComponent } from "@/components/video";
import { Skeleton } from "@/components/ui/skeleton";
import { OpenAI } from "openai";
import { generateId } from "ai";
import { useSettings } from "@/lib/hooks/use-settings";

interface Memory {
  id: string;
  timestamp: string;
  preview_url: string;
  duration: number;
  app_name: string;
  text: string;
}

interface VideoDescription {
  id: string;
  loading: boolean;
  content: string;
}

export function MemoriesGallery() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { settings } = useSettings();
  const [videoDescriptions, setVideoDescriptions] = useState<{
    [key: string]: VideoDescription;
  }>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const [collectiveDescription, setCollectiveDescription] = useState<{
    loading: boolean;
    content: string;
  }>({ loading: false, content: "" });

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async (append = false) => {
    // if (isLoading || loadingMore) return;

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const targetCount = 6;
      const uniqueMemories = new Set(memories.map((m) => m.id));
      const newMemories: any[] = [];

      const MAX_ATTEMPTS = 12; // 2x the target count
      let totalAttempts = 0;

      for (
        let attempt = 0;
        attempt < targetCount * 2 &&
        newMemories.length < targetCount &&
        totalAttempts < MAX_ATTEMPTS;
        attempt++
      ) {
        totalAttempts++;

        const randomTime = new Date(
          thirtyDaysAgo.getTime() +
            Math.random() * (fiveMinutesAgo.getTime() - thirtyDaysAgo.getTime())
        );

        const response = await pipe.queryScreenpipe({
          limit: 2,
          contentType: "ocr",
          //   includeFrames: true,
          startTime: new Date(
            randomTime.getTime() - 1 * 60 * 60 * 1000
          ).toISOString(),
          endTime: new Date(
            randomTime.getTime() + 1 * 60 * 60 * 1000
          ).toISOString(),
        });

        console.log(
          `attempt ${totalAttempts}: got ${response?.data?.length || 0} results`
        );

        if (!response?.data?.length) {
          continue;
        }

        if (response?.data?.length) {
          for (const item of response.data) {
            // @ts-ignore
            if (!uniqueMemories.has(item.content.frameId)) {
              // @ts-ignore
              uniqueMemories.add(item.content.frameId);
              newMemories.push({
                // @ts-ignore
                id: item.content.frameId,
                timestamp: item.content.timestamp,
                preview_url: item.content.filePath,
                duration: 0,
                // @ts-ignore
                app_name: item.content.appName || "",
                // @ts-ignore
                text: item.content.text,
              });
            }
          }
        }
      }

      // If we didn't get enough memories, work with what we have
      if (newMemories.length === 0) {
        toast({
          title: "note",
          description: "no new memories found for this time period",
        });
      }

      setMemories((prev) => (append ? [...prev, ...newMemories] : newMemories));

      // Scroll to bottom if appending
      if (append) {
        setTimeout(() => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to load memories",
      });
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  const generateVideoDescription = async (memory: Memory) => {
    if (videoDescriptions[memory.id]) return;

    const openai = new OpenAI({
      apiKey:
        settings.aiProviderType === "screenpipe-cloud"
          ? settings.user.token
          : settings.openaiApiKey,
      baseURL: settings.aiUrl,
      dangerouslyAllowBrowser: true,
    });

    setVideoDescriptions((prev) => ({
      ...prev,
      [memory.id]: {
        id: generateId(),
        loading: true,
        content: "",
      },
    }));

    try {
      abortControllerRef.current = new AbortController();

      const stream = await openai.chat.completions.create(
        {
          model: settings.aiModel,
          messages: [
            {
              role: "system",
              content:
                "you are a helpful assistant that provides concise descriptions of OCR content from screen recordings. focus on key activities and content visible in the recording. you create short description of memories in less than 20 words.",
            },
            {
              role: "user",
              content: `describe this screen recording. app: ${memory.app_name}, text: ${memory.text}, duration: ${memory.duration}s`,
            },
          ],
          stream: true,
        },
        {
          signal: abortControllerRef.current.signal,
        }
      );

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;

        setVideoDescriptions((prev) => ({
          ...prev,
          [memory.id]: {
            ...prev[memory.id],
            content: fullResponse,
          },
        }));
      }
    } catch (err) {
      console.log("Failed to generate description:", err);
      // toast({
      //   variant: "destructive",
      //   title: "error",
      //   description: "failed to generate video description",
      // });
    } finally {
      setVideoDescriptions((prev) => ({
        ...prev,
        [memory.id]: {
          ...prev[memory.id],
          loading: false,
        },
      }));
    }
  };

  const generateCollectiveDescription = async () => {
    if (memories.length === 0) return;

    setCollectiveDescription({ loading: true, content: "" });

    try {
      const openai = new OpenAI({
        apiKey:
          settings.aiProviderType === "screenpipe-cloud"
            ? settings.user.token
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const memoryTexts = memories
        .map(
          (m) =>
            `[${format(new Date(m.timestamp), "PPp")} - ${m.app_name}]: ${
              m.text
            }`
        )
        .join("\n");

      const stream = await openai.chat.completions.create({
        model: settings.aiModel,
        messages: [
          {
            role: "system",
            content:
              "you are a helpful assistant that provides concise summaries of daily activities from screen recordings. create a brief narrative of what the person was doing across these memories in 2-3 sentences max. its a bunch of OCR'd screens, make something value packed and interesting.",
          },
          {
            role: "user",
            content: `summarize these screen recording contents:\n${memoryTexts}`,
          },
        ],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        setCollectiveDescription((prev) => ({
          ...prev,
          content: fullResponse,
        }));
      }
    } catch (err) {
      console.log("failed to generate collective description:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to generate collective description",
      });
    } finally {
      setCollectiveDescription((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {isLoading
          ? // Initial loading skeletons
            [...Array(6)].map((_, i) => (
              <div
                key={`initial-skeleton-${i}`}
                className="rounded-lg overflow-hidden bg-background border"
              >
                <Skeleton className="aspect-video w-full" />
                <div className="p-3 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))
          : // Existing memories rendering
            memories.map((memory) => (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg overflow-hidden bg-background border flex flex-col"
              >
                <VideoComponent
                  filePath={memory.preview_url}
                  className="w-full h-full"
                  onLoadStart={() => generateVideoDescription(memory)}
                />
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {format(new Date(memory.timestamp), "PPp")}
                  </div>
                  {videoDescriptions[memory.id] && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground mt-2"
                    >
                      {videoDescriptions[memory.id].loading ? (
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                          generating description...
                        </div>
                      ) : (
                        videoDescriptions[memory.id].content
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}

        {/* Loading skeletons for load more */}
        {loadingMore && (
          <>
            {[...Array(6)].map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-lg overflow-hidden bg-background border"
              >
                <Skeleton className="aspect-video w-full" />
                <div className="p-3 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-8 space-y-4">
        <Button
          className="mx-auto block"
          onClick={generateCollectiveDescription}
          disabled={isLoading || loadingMore || collectiveDescription.loading}
        >
          {collectiveDescription.loading ? (
            <div className="flex items-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              generating summary...
            </div>
          ) : (
            "generate summary of visible memories"
          )}
        </Button>

        {collectiveDescription.content && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground text-center max-w-2xl mx-auto p-4 rounded-lg border bg-background"
          >
            {collectiveDescription.content}
          </motion.div>
        )}
      </div>

      <Button
        variant="outline"
        className="mt-8 mx-auto block"
        onClick={() => fetchMemories(true)}
        disabled={isLoading || loadingMore}
      >
        {loadingMore ? "loading..." : "load more memories"}
      </Button>
    </div>
  );
}
