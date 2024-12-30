"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { pipe, ContentItem } from "@screenpipe/js";
import { VideoComponent } from "@/components/video";
import { Skeleton } from "@/components/ui/skeleton";

interface Memory {
  id: string;
  timestamp: string;
  preview_url: string;
  duration: number;
  app_name: string;
  title: string;
}

export function MemoriesGallery() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async (append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const targetCount = 6;
      const uniqueMemories = new Set(memories.map((m) => m.id));
      const newMemories = [];

      for (
        let attempt = 0;
        attempt < targetCount * 4 && newMemories.length < targetCount;
        attempt++
      ) {
        const randomTime = new Date(
          thirtyDaysAgo.getTime() +
            Math.random() * (now.getTime() - thirtyDaysAgo.getTime())
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

        if (response?.data?.length) {
          for (const item of response.data) {
            if (!uniqueMemories.has(item.content.frameId)) {
              uniqueMemories.add(item.content.frameId);
              newMemories.push({
                id: item.content.frameId,
                timestamp: item.content.timestamp,
                preview_url: item.content.filePath,
                duration: 0,
                app_name: item.content.appName || "",
                title: item.content.text.slice(0, 50) + "...",
              });
            }
          }
        }
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
                className="relative rounded-lg overflow-hidden bg-background border flex flex-col"
              >
                <div className="relative aspect-video flex-shrink-0">
                  <VideoComponent
                    filePath={memory.preview_url}
                    className="w-full h-full"
                  />
                </div>
                <div className="p-3 space-y-1 flex-1">
                  <div className="flex items-center justify-center text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 mr-1" />
                    {format(new Date(memory.timestamp), "PPp")}
                  </div>
                  <div
                    className="text-xs text-muted-foreground truncate text-center"
                    title={memory.preview_url}
                  >
                    {memory.app_name}
                  </div>
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
