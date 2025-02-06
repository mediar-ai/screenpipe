"use client";

import * as React from "react";
import { useState } from "react";
import { Bot, Wand2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import OpenAI from "openai";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/use-toast";
import { SheetTitle } from "./ui/sheet";
import { motion } from "framer-motion";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SearchFilters {
  query: string;
  contentType: string;
  appName: string;
  windowName: string;
  startDate: Date;
  endDate: Date;
  limit: number;
}

interface SearchFilterGeneratorProps {
  onApplyFilters: (filters: Partial<SearchFilters>) => void;
}

interface SearchFilterVariant {
  filters: Partial<SearchFilters>;
  description: string;
  title: string;
}

const SearchFilterSchema = z.object({
  title: z.string(),
  query: z.string().optional(),
  contentType: z
    .enum(["all", "ocr", "audio", "ui", "audio+ui", "ocr+ui", "audio+ocr"])
    .optional(),
  appName: z.string().optional(),
  windowName: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
  limit: z.number().optional(),
});

export function SearchFilterGenerator({
  onApplyFilters,
}: SearchFilterGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [filterVariants, setFilterVariants] = useState<SearchFilterVariant[]>(
    []
  );
  const { settings } = useSettings();

  React.useEffect(() => {
    setIsMac(navigator.userAgent.includes("Mac"));
  }, []);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleGenerateFilters = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setFilterVariants([]);

    try {
      const openai = new OpenAI({
        apiKey:
          settings.aiProviderType === "screenpipe-cloud"
            ? settings.user.token
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const currentDate = new Date().toISOString();

      const completion = await openai.beta.chat.completions.parse({
        model: settings.aiModel,
        messages: [
          {
            role: "system",
            content: `You are a search filter generator for Screenpipe's 24/7 recording context database. Generate 3 different search filter interpretations based on the user's natural language query. The current date and time is ${currentDate}. Use this as reference when interpreting relative time expressions like "today", "last week", etc.

Key Database Tables & Content Types:

1. Screen Recording (OCR):
- Captures all visible text from screens via OCR
- Includes app_name, window_name, timestamp
- Full text search via ocr_text_fts table
- Best for finding: code snippets, documentation, browser content, chat messages, emails

2. Audio Recording:
- Transcribed speech from microphone input
- Includes speaker identification, device info
- Full text search via audio_transcriptions_fts
- Best for finding: meetings, calls, voice notes, spoken commands
- Can filter by specific speakers or devices

3. UI Monitoring:
- App and window state/focus tracking
- Includes app_name, window_name, timestamps
- Full text search via ui_monitoring_fts
- Best for: productivity analysis, app usage patterns, window switching behavior

Common Query Types & Examples:

1. Meeting & Communication:
{
  query: "meet",
  contentType: "audio",
  startDate: "2024-03-20T09:00:00Z",
  endDate: "2024-03-20T12:00:00Z",
  limit: 120
}

2. Email & Messages:
{
  query: "john",
  contentType: "ocr",
  windowName: "Gmail",
  startDate: "2024-03-13T00:00:00Z",
  endDate: "2024-03-20T23:59:59Z",
  limit: 25
}

3. Code & Development:
{
  query: "transformers",
  contentType: "ocr",
  windowName: "Visual Studio Code",
  limit: 50
}

4. Productivity Analysis:
{
  query: "",
  contentType: "ui",
  windowName: "Twitter",  // Single window name, not pipe-separated
  startDate: "2024-03-19T00:00:00Z",
  endDate: "2024-03-19T23:59:59Z",
  limit: 100
}

5. Research & Documentation:
{
  query: "papers",
  contentType: "ocr+audio",
  windowName: "arXiv.org",  // Exact window name
  limit: 30
}

Search Filter Parameters:
- query: Text to search for across content types
- contentType: "all" | "ocr" | "audio" | "ui" | "audio+ui" | "ocr+ui" | "audio+ocr"
- startDate & endDate: ISO timestamp for time range
- appName: Exact application name (e.g., "Chrome", "Code")
- windowName: Exact window title (e.g., "Gmail", "arXiv.org", or browser tab name)
- limit: Max number of results (default 100)
- speakerIds: Filter audio by specific speakers

Generation Strategy:
1. Analyze the user's query for:
   - Keywords (e.g., "meeting", "code", "email", do not use spaces or multiple words). Have a bias for no keywords to prevent filtering out all content.
   - Time context (today, last week, specific date)
   - Content type hints (meeting → audio, code → ocr)
   - App/window context (exact names, no wildcards, do not use spaces, keep empty if wants to select all)
   - Length requirements (short snippets vs full content)

2. Generate 3 variations:
   - Broad: Wider time range, multiple content types
   - Focused: Specific content type, exact window/app name
   - Balanced: Medium scope with optimal filters

Return exactly 3 JSON objects in an array with no additional text.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: zodResponseFormat(
          z.array(SearchFilterSchema).length(3),
          "search_filters"
        ),
      });

      const variants = completion.choices[0].message.parsed;
      if (variants) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        setFilterVariants(
          variants.map((filters, i) => ({
            filters: {
              ...filters,
              startDate: filters.startDate
                ? new Date(filters.startDate).toString() === "Invalid Date"
                  ? yesterday
                  : new Date(filters.startDate)
                : undefined,
              endDate: filters.endDate
                ? new Date(filters.endDate).toString() === "Invalid Date"
                  ? now
                  : new Date(filters.endDate)
                : undefined,
            },
            description: `variant ${i + 1}`,
            title: filters.title || `variant ${i + 1}`,
          }))
        );
      }
    } catch (error: any) {
      console.error("error generating filters:", error);
      toast({
        title: "error",
        description: "failed to generate search filters",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 relative group"
              onClick={() => setOpen(true)}
              disabled={isLoading}
            >
              <Wand2 className={`h-4 w-4 ${isLoading ? "opacity-0" : ""}`} />
              {isLoading && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </motion.div>
              )}
              <span className="sr-only">generate filters with ai</span>
              <kbd className="pointer-events-none absolute hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-0 group-hover:opacity-100 right-full mr-2 sm:flex">
                <span className="text-xs">{isMac ? "⌘" : "ctrl"}</span>K
              </kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>generate filters with ai</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <SheetTitle></SheetTitle>
        <motion.div
          className="flex items-center justify-center gap-2 p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-xs">using {settings.aiModel}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <CommandInput
            className="w-full max-w-xl"
            placeholder="describe what you want to search for..."
            value={prompt}
            onValueChange={setPrompt}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) {
                e.preventDefault();
                handleGenerateFilters();
              }
            }}
          />
        </motion.div>

        {!isLoading && filterVariants.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <Search className="h-12 w-12 text-muted-foreground/50" />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                try examples like:
              </h4>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() =>
                    setPrompt("find my zoom meetings from last week")
                  }
                >
                  zoom meetings from last week
                </Badge>
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setPrompt("what did i discuss with john recently?")}
                >
                  what did i discuss with john recently?
                </Badge>
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setPrompt("stuff i did on twitter this week")}
                >
                  stuff i did on twitter this week
                </Badge>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 max-h-[60vh] overflow-y-auto">
            {[1, 2, 3].map((i) => (
              <Card
                key={i}
                className="relative bg-background border h-32 animate-pulse"
              >
                <CardContent className="p-3 flex flex-col h-full space-y-3">
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded bg-muted mr-2" />
                    <div className="h-4 w-24 bg-muted rounded" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-5 w-20 bg-muted rounded-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filterVariants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 max-h-[60vh] overflow-y-auto">
            {filterVariants.map((variant, index) => (
              <TooltipProvider key={index}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative group h-full">
                      <Card
                        className="cursor-pointer relative bg-background border h-full transition-all duration-300 ease-out hover:scale-[0.98] hover:border-primary"
                        onClick={() => {
                          onApplyFilters(variant.filters);
                          setOpen(false);
                        }}
                      >
                        <CardContent className="p-3 flex flex-col h-full">
                          <div className="flex items-center mb-1">
                            <h3 className="text-sm font-semibold">
                              {variant.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {variant.filters.query && (
                              <Badge>query: {variant.filters.query}</Badge>
                            )}
                            {variant.filters.contentType && (
                              <Badge>{variant.filters.contentType}</Badge>
                            )}
                            {variant.filters.appName && (
                              <Badge>app: {variant.filters.appName}</Badge>
                            )}
                            {variant.filters.windowName && (
                              <Badge>
                                window: {variant.filters.windowName}
                              </Badge>
                            )}
                            {variant.filters.startDate && (
                              <Badge>
                                from:{" "}
                                {variant.filters.startDate.toLocaleDateString()}
                              </Badge>
                            )}
                            {variant.filters.limit && (
                              <Badge>limit: {variant.filters.limit}</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TooltipTrigger>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        )}
      </CommandDialog>
    </>
  );
}
