"use client";

import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { StreamTimeSeriesResponse } from "@/app/page";

interface TimelineSearchProps {
  frames: StreamTimeSeriesResponse[];
  onResultSelect: (index: number) => void;
  onSearchResults?: (results: number[]) => void;
}

// Extract meaningful keywords from frames
function extractKeywords(frames: StreamTimeSeriesResponse[]): string[] {
  const keywords = new Map<string, number>();

  // Common words to filter out
  const stopWords = new Set([
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "i",
    "it",
    "for",
    "not",
    "on",
    "with",
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "say",
    "her",
    "she",
    "or",
    "an",
    "will",
    "my",
    "one",
    "all",
    "would",
    "there",
    "their",
    "what",
    "so",
    "up",
    "out",
    "if",
    "about",
    "who",
    "get",
    "which",
    "go",
    "me",
    "when",
    "make",
    "can",
    "like",
    "time",
    "no",
    "just",
    "him",
    "know",
    "take",
    "people",
    "into",
    "year",
    "your",
    "good",
    "some",
    "could",
    "them",
    "see",
    "other",
    "than",
    "then",
    "now",
    "look",
    "only",
    "come",
    "its",
    "over",
    "think",
    "also",
    "back",
    "after",
    "use",
    "two",
    "how",
    "our",
    "work",
    "first",
    "well",
    "way",
    "even",
    "new",
    "want",
    "because",
    "any",
    "these",
    "give",
    "day",
    "most",
    "us",
  ]);

  // Patterns for valuable information
  const patterns = {
    email: /\b[\w\.-]+@[\w\.-]+\.\w+\b/g,
    url: /https?:\/\/[^\s]+/g,
    date: /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?\b/gi,
    time: /\b(?:1[0-2]|0?[1-9])(?::[0-5][0-9])?\s*(?:am|pm)\b/gi,
    properNoun: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
    appName:
      /\b(?:vscode|chrome|firefox|safari|slack|discord|zoom|teams|figma|notion|github)\b/gi,
    codeTerms:
      /\b(?:function|class|const|let|var|import|export|async|await|return|if|else|for|while)\b/g,
    numbers: /\b\d+(?:\.\d+)?[kmbt]?\b/gi,
  };

  frames.forEach((frame) => {
    frame.devices.forEach((device) => {
      const text = [
        device.metadata.ocr_text,
        device.metadata.window_name,
        ...device.audio.map((a) => a.transcription),
      ].join(" ");

      // Extract patterns
      Object.entries(patterns).forEach(([type, pattern]) => {
        const matches = text.match(pattern) || [];
        matches.forEach((match) => {
          const key = `${match.toLowerCase()}`;
          if (!stopWords.has(key) && key.length > 2) {
            keywords.set(key, (keywords.get(key) || 0) + 1);
          }
        });
      });

      // Extract potential important phrases (2-3 words)
      const words = text.split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = words
          .slice(i, i + 2)
          .join(" ")
          .toLowerCase();
        if (phrase.split(" ").every((word) => !stopWords.has(word))) {
          keywords.set(phrase, (keywords.get(phrase) || 0) + 1);
        }
      }
    });
  });

  // Score and rank keywords
  const scoredKeywords = Array.from(keywords.entries()).map(([word, count]) => {
    let score = count;

    // Boost certain types of keywords
    if (word.match(patterns.email)) score *= 2;
    if (word.match(patterns.properNoun)) score *= 1.5;
    if (word.match(patterns.date)) score *= 1.3;
    if (word.match(patterns.appName)) score *= 1.2;

    // Penalize very common words
    if (count > frames.length / 2) score *= 0.5;

    return { word, score };
  });

  // Return top 10 most valuable keywords
  return scoredKeywords
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((k) => k.word);
}

export function TimelineSearch2({
  frames,
  onResultSelect,
  onSearchResults,
}: TimelineSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const keywords = extractKeywords(frames);

  const handleSearch = useCallback(
    (query: string) => {
      setIsSearching(true);

      // Find all matching frames
      const results = frames.reduce<number[]>((matches, frame, index) => {
        const hasMatch = frame.devices.some((device) => {
          const searchText = [
            device.metadata.ocr_text,
            device.metadata.window_name,
            ...device.audio.map((a) => a.transcription),
          ]
            .join(" ")
            .toLowerCase();

          return searchText.includes(query.toLowerCase());
        });

        if (hasMatch) matches.push(index);
        return matches;
      }, []);

      // Instead of jumping, send results to parent
      if (results.length > 0) {
        onSearchResults?.(results);
        setOpen(false);
      }

      setIsSearching(false);
    },
    [frames, onSearchResults]
  );

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="backdrop-blur-sm" />
          <DialogContent className="sm:max-w-[500px]">
            <DialogTitle>search your timeline</DialogTitle>
            <div className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="search in your timeline..."
                  className="pl-9 h-12"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSearching) {
                      handleSearch(searchQuery);
                    }
                  }}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                )}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6"
              >
                <p className="text-sm text-muted-foreground mb-3">
                  common keywords
                </p>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword) => (
                    <Button
                      key={keyword}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(keyword)}
                      className="text-xs"
                    >
                      {keyword}
                    </Button>
                  ))}
                </div>
              </motion.div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
}
