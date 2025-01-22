"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { StreamTimeSeriesResponse } from "@/app/page";
import OpenAI from "openai";
import { useSettings } from "@/lib/hooks/use-settings";

interface TimelineSearchProps {
  frames: StreamTimeSeriesResponse[];
  onResultSelect: (index: number) => void;
}

interface SearchParams {
  apps: string[];
  keywords: string[];
  type: "app_focus" | "content_search";
}

function isValidSearchParams(obj: any): obj is SearchParams {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.apps) &&
    obj.apps.every((app: string) => typeof app === "string") &&
    Array.isArray(obj.keywords) &&
    obj.keywords.every((keyword: string) => typeof keyword === "string") &&
    typeof obj.type === "string" &&
    (obj.type === "app_focus" || obj.type === "content_search")
  );
}

async function findRelevantFrame(
  query: string,
  frames: StreamTimeSeriesResponse[],
  openai: OpenAI,
  model: string,
  onProgress: (status: string) => void
): Promise<number | null> {
  onProgress("analyzing query...");

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content:
            "you are a search assistant that helps find specific moments in screen recordings. output only valid json with the exact structure requested.",
        },
        {
          role: "user",
          content: `analyze this search query and extract key information: "${query}"
          output format: {
            "apps": string[], // possible app names to look for, must be non-empty array
            "keywords": string[], // important keywords to match, must be non-empty array
            "type": "app_focus" | "content_search" // whether we're looking for app usage or specific content
          }
          
          for example, if the user asks "when i was coding in vscode", the output should be:
          {
            "apps": ["vscode"],
            "keywords": ["coding"],
            "type": "app_focus"
          }
          
          if the user asks "when i was watching a youtube video about rust", the output should be:
          {
            "apps": ["youtube"],
            "keywords": ["rust"],
            "type": "content_search"
          }
          `,
        },
      ],
      response_format: { type: "json_object" },
    });

    const jsonContent = response.choices[0].message.content;
    if (!jsonContent) {
      throw new Error("no response content from ai");
    }

    const parsed = JSON.parse(jsonContent);
    console.log("parsed search params:", parsed);

    if (!isValidSearchParams(parsed)) {
      throw new Error(
        "invalid or malformed search parameters from ai response"
      );
    }

    const searchParams = parsed;

    const searchType = searchParams.type === "app_focus" ? "apps" : "keywords";
    onProgress(
      `looking for ${searchType} matching: ${searchParams[searchType].join(
        ", "
      )}`
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // search through frames based on extracted parameters
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      for (const device of frame.devices) {
        // app focus search
        if (searchParams.type === "app_focus") {
          if (
            searchParams.apps.some(
              (app: string) =>
                device.metadata.app_name
                  ?.toLowerCase()
                  .includes(app.toLowerCase()) ||
                device.metadata.window_name
                  ?.toLowerCase()
                  .includes(app.toLowerCase())
            )
          ) {
            return i;
          }
        }

        // content search
        else {
          const hasKeywords = searchParams.keywords.some((keyword: string) => {
            const keywordLower = keyword.toLowerCase();
            return (
              device.metadata.ocr_text?.toLowerCase().includes(keywordLower) ||
              device.metadata.window_name
                ?.toLowerCase()
                .includes(keywordLower) ||
              device.audio.some((a) =>
                a.transcription?.toLowerCase().includes(keywordLower)
              )
            );
          });

          if (hasKeywords) {
            return i;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("search parameter parsing error:", error);
    throw new Error(`failed to parse search parameters: ${error}`);
  }
}

export function TimelineSearch({
  frames,
  onResultSelect,
}: TimelineSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { settings } = useSettings();

  // dummy suggestions - these would come from AI analysis later
  const suggestions = [
    "when i was coding in vscode",
    "that meeting in google meet",
    "when i opened figma",
    "that youtube video about rust",
    "when i was writing in notion",
  ];

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    setSearchStatus("");

    const openai = new OpenAI({
      apiKey:
        settings.aiProviderType === "screenpipe-cloud"
          ? settings.user.token
          : settings.openaiApiKey,
      baseURL: settings.aiUrl,
      dangerouslyAllowBrowser: true,
    });

    try {
      const frameIndex = await findRelevantFrame(
        query,
        frames,
        openai,
        settings.aiModel,
        (status) => setSearchStatus(status)
      );

      if (frameIndex !== null) {
        onResultSelect(frameIndex);
        setOpen(false);
      } else {
        setSearchStatus(
          "couldn't find that moment. try being more specific about the app or content you're looking for."
        );
      }
    } catch (error) {
      console.error("search error:", error);
      setSearchStatus("search failed. please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="rounded-full"
      >
        <Search className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(newOpen) => {
          if (!isSearching) {
            setOpen(newOpen);
          }
        }}
      >
        <DialogPortal>
          <DialogOverlay
            className="backdrop-blur-sm"
            style={{
              opacity: isSearching ? 0 : 0.8,
            }}
          />
          <DialogContent asChild className="sm:max-w-[500px]">
            <motion.div
              animate={{
                x: isSearching ? 200 : 0,
                transition: { duration: 0.3, ease: "easeInOut" },
              }}
            >
              <DialogTitle>Search your timeline</DialogTitle>
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-6"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="search in your timeline..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSearching) {
                        handleSearch(searchQuery);
                      }
                    }}
                  />
                </div>

                {searchStatus && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-sm text-muted-foreground"
                  >
                    {searchStatus}
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="mt-4"
                >
                  <p className="text-sm text-muted-foreground mb-3">
                    suggested searches
                  </p>
                  <div className="space-y-2">
                    {suggestions.map((suggestion, i) => (
                      <motion.div
                        key={suggestion}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                      >
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-left h-auto py-2"
                          onClick={() => handleSearch(suggestion)}
                          disabled={isSearching}
                        >
                          {suggestion}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
}
