"use client";

import React, { JSX, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pipe, type ContentItem } from "@screenpipe/browser";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAiProvider } from "@/lib/hooks/use-ai-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { DateTimePicker } from "./date-time-picker";
import { Badge } from "./ui/badge";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Laptop,
  Layers,
  Layout,
  Loader2,
  Search,
  Send,
  Square,
  Clock,
  Check,
  Plus,
  AlertCircle,
  SpeechIcon,
  ChevronsUpDown,
  Bot,
  Settings,
  Copy,
} from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { generateId, Message } from "ai";
import { OpenAI } from "openai";
import { ChatMessage } from "@/components/chat-message";
import { spinner } from "@/components/spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VideoComponent } from "@/components/video";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ContextUsageIndicator } from "@/components/context-usage-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { IconCode } from "@/components/ui/icons";
import { CodeBlock } from "@/components/ui/codeblock";
import { SqlAutocompleteInput } from "@/components/sql-autocomplete-input";
import { cn, removeDuplicateSelections } from "@/lib/utils";
import {
  ExampleSearch,
  ExampleSearchCards,
} from "@/components/example-search-cards";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import {
  SearchHistory,
  useSearchHistory,
} from "@/lib/hooks/use-search-history";
import {
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Command,
} from "./ui/command";
import { type Speaker } from "@screenpipe/browser";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSettings } from "@/lib/hooks/use-settings";
import { SearchFilterGenerator } from "./search-filter-generator";
import {
  MultiSelectCombobox,
  type BaseOption,
} from "@/components/ui/multi-select-combobox";

interface Agent {
  id: string;
  name: string;
  description: string;
  dataSelector: (results: ContentItem[]) => any;
  systemPrompt: string;
}

const AGENTS: Agent[] = [
  {
    id: "context-master",
    name: "context master",
    description: "analyzes everything: apps, windows, text & audio",
    systemPrompt:
      "you analyze all types of data from screen recordings and audio transcriptions. provide comprehensive insights.",
    dataSelector: (results) => results,
  },
  {
    id: "window-detective",
    name: "window detective",
    description: "focuses on app usage patterns",
    systemPrompt:
      "you specialize in analyzing app usage patterns and window switching behavior. help users understand their app usage.",
    dataSelector: (results) =>
      results
        .filter(
          (item) =>
            item.type === "OCR" &&
            (item.content.appName || item.content.windowName)
        )
        .map((item) => ({
          timestamp: item.content.timestamp,
          // @ts-ignore
          appName: item.content.appName,
          // @ts-ignore
          windowName: item.content.windowName,
        })),
  },
  {
    id: "text-oracle",
    name: "text oracle",
    description: "analyzes screen text (OCR)",
    systemPrompt:
      "you focus on text extracted from screen recordings. help users find and understand text content.",
    dataSelector: (results) =>
      results
        .filter((item) => item.type === "OCR")
        .map((item) => ({
          timestamp: item.content.timestamp,
          text: item.content.text,
          appName: item.content.appName,
        })),
  },
  {
    id: "voice-sage",
    name: "voice sage",
    description: "focuses on audio transcriptions",
    systemPrompt:
      "you analyze audio transcriptions from recordings. help users understand spoken content.",
    dataSelector: (results) =>
      results
        .filter((item) => item.type === "Audio")
        .map((item) => ({
          timestamp: item.content.timestamp,
          transcription: item.content.transcription,
        })),
  },
];

// Add this helper function to highlight keywords in text
const highlightKeyword = (text: string, keyword: string): JSX.Element => {
  if (!keyword || !text) return <>{text}</>;

  const parts = text.split(new RegExp(`(${keyword})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span
            key={i}
            className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

// Update the getContextAroundKeyword function to return both text and positions
const getContextAroundKeyword = (
  text: string,
  keyword: string,
  contextLength: number = 40
): string => {
  if (!keyword || !text) return text;

  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) return text;

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + keyword.length + contextLength);

  let result = text.slice(start, end);
  if (start > 0) result = "..." + result;
  if (end < text.length) result = result + "...";

  return result;
};

export function SearchChat() {
  const {
    searches,
    currentSearchId,
    setCurrentSearchId,
    addSearch,
    deleteSearch,
    isCollapsed,
    toggleCollapse,
  } = useSearchHistory();
  // Search state
  const { health, isServerDown } = useHealthCheck();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() - 24 * 3600000)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [includeFrames, setIncludeFrames] = useState(false);
  const [limit, setLimit] = useState(30);
  const [appName, setAppName] = useState("");
  const [windowName, setWindowName] = useState("");
  const [contentType, setContentType] = useState("all");
  const [offset, setOffset] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const { settings } = useSettings();
  const { isAvailable, error } = useAiProvider(settings);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [minLength, setMinLength] = useState(50);
  const [maxLength, setMaxLength] = useState(10000);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakers, setSelectedSpeakers] = useState<{
    [key: number]: Speaker;
  }>({});
  const [openSpeakers, setOpenSpeakers] = useState(false);
  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<Message>>([]);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);

  const [floatingInput, setFloatingInput] = useState("");
  const [isFloatingInputVisible, setIsFloatingInputVisible] = useState(false);

  const floatingInputRef = useRef<HTMLInputElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollPosition = useRef(0);

  const MAX_CONTENT_LENGTH = settings.aiMaxContextChars;

  const [selectedResults, setSelectedResults] = useState<Set<number>>(
    new Set()
  );
  const [similarityThreshold, setSimilarityThreshold] = useState(1);

  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectAll, setSelectAll] = useState(true);

  const [showExamples, setShowExamples] = useState(true);

  const [hasSearched, setHasSearched] = useState(false);

  const [isFiltering, setIsFiltering] = useState(false);
  const debouncedThreshold = useDebounce(similarityThreshold, 300);

  const [isQueryParamsDialogOpen, setIsQueryParamsDialogOpen] = useState(false);

  // Add state for individual content types
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(
    []
  );

  // Define content type options
  const contentTypeOptions: BaseOption[] = [
    { label: "Speech", value: "audio" },
    { label: "Screen UI", value: "ui" },
    { label: "Screen Capture", value: "ocr" },
  ];

  // Define content type descriptions for tooltips
  const contentTypeDescriptions: Record<string, string> = {
    audio: "audio transcripts",
    ui: "text emitted directly from the source code of the desktop applications",
    ocr: "recognized text from screenshots taken every 5s by default",
  };
  const [selectedTypes, setSelectedTypes] = useState({
    ocr: false,
    audio: false,
    ui: false,
  });

  // Add new state near the top with other state declarations
  const [hideDeselected, setHideDeselected] = useState(false);

  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);

  const [speakerSearchQuery, setSpeakerSearchQuery] = useState("");

  const [frameName, setFrameName] = useState<string>("");

  // Add this state for browser URL
  const [browserUrl, setBrowserUrl] = useState("");

  useEffect(() => {
    if (Object.keys(selectedSpeakers).length > 0) {
      setSelectedContentTypes(["audio"]);
      setContentType("audio");
    }
  }, [selectedSpeakers]);

  useEffect(() => {
    // More reliable OS detection using navigator.userAgentData when available
    if ("userAgentData" in navigator) {
      // @ts-ignore - TypeScript doesn't know about userAgentData yet
      const platform = navigator.userAgent.toLowerCase();
      setCurrentPlatform(
        platform.includes("mac")
          ? "macos"
          : platform.includes("win")
          ? "windows"
          : platform.includes("linux")
          ? "linux"
          : "unknown"
      );
    } else {
      // Fallback to platform for older browsers
      const platform = window.navigator.platform.toLowerCase();
      setCurrentPlatform(
        platform.includes("mac")
          ? "macos"
          : platform.includes("win")
          ? "windows"
          : platform.includes("linux")
          ? "linux"
          : "unknown"
      );
    }
  }, []);

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        ((currentPlatform === "macos" && e.metaKey) ||
          (currentPlatform !== "macos" && e.ctrlKey))
      ) {
        e.preventDefault();
        handleSearch(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPlatform]);

  const handleSpeakerChange = (speaker: Speaker) => {
    setSelectedSpeakers((prev) => {
      const newSpeakers = { ...prev, [speaker.id]: speaker };

      if (prev[speaker.id]) {
        delete newSpeakers[speaker.id];
      }

      return newSpeakers;
    });
  };

  useEffect(() => {
    if (isQueryParamsDialogOpen && !speakers.length) {
      loadSpeakers();
    }
  }, [isQueryParamsDialogOpen]);

  useEffect(() => {
    loadSpeakers();
  }, [speakerSearchQuery]);

  const loadSpeakers = async () => {
    try {
      const getSpeakers = await fetch(
        `http://localhost:3030/speakers/search?name=${speakerSearchQuery}`
      );
      const speakers = await getSpeakers.json();
      setSpeakers(speakers);
    } catch (error) {
      console.error("Error loading speakers:", error);
      setSpeakers([]);
    }
  };

  // Update content type when checkboxes change
  const handleContentTypeChange = (values: string[]) => {
    setSelectedContentTypes(values);

    // Convert selected values to content type
    if (values.length === 0) {
      setContentType("all");
    } else if (values.length === 3) {
      setContentType("all");
    } else if (
      values.includes("audio") &&
      values.includes("ui") &&
      !values.includes("ocr")
    ) {
      setContentType("audio+ui");
    } else if (
      values.includes("ocr") &&
      values.includes("ui") &&
      !values.includes("audio")
    ) {
      setContentType("ocr+ui");
    } else if (
      values.includes("audio") &&
      values.includes("ocr") &&
      !values.includes("ui")
    ) {
      setContentType("audio+ocr");
    } else if (values.includes("audio")) {
      setContentType("audio");
    } else if (values.includes("ocr")) {
      setContentType("ocr");
    } else if (values.includes("ui")) {
      setContentType("ui");
    } else {
      setContentType("all");
    }

    // Update selectedTypes for backward compatibility
    setSelectedTypes({
      ocr: values.includes("ocr"),
      audio: values.includes("audio"),
      ui: values.includes("ui"),
    });
  };

  const handleContentTypeFromFilter = (contentType: string) => {
    // Update content type
    setContentType(contentType);

    // Update selected content types based on content type
    const newSelectedTypes: string[] = [];
    if (contentType === "all") {
      // Keep empty to indicate all
    } else {
      if (contentType.includes("ocr")) newSelectedTypes.push("ocr");
      if (contentType.includes("audio")) newSelectedTypes.push("audio");
      if (contentType.includes("ui")) newSelectedTypes.push("ui");
    }
    setSelectedContentTypes(newSelectedTypes);

    // Update checkbox states for backward compatibility
    setSelectedTypes({
      ocr: contentType.includes("ocr") || contentType === "all",
      audio: contentType.includes("audio") || contentType === "all",
      ui: contentType.includes("ui") || contentType === "all",
    });
  };

  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0]);

  useEffect(() => {
    const updateDates = () => {
      const now = new Date();
      setEndDate(now);
      // Optionally update startDate if you want to maintain a rolling time window
      // setStartDate(new Date(now.getTime() - 24 * 3600000)); // 24 hours ago
    };

    // Update dates immediately
    updateDates();

    // Set up interval to update dates every 5 minutes
    const intervalId = setInterval(updateDates, 5 * 60 * 1000);

    // Add event listener for when the page becomes visible
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        updateDates();
      }
    });

    // Clean up on component unmount
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", updateDates);
    };
  }, []);

  const isAiDisabled =
    !settings.user?.token && settings.aiProviderType === "screenpipe-cloud";

  const handleExampleSelect = async (example: ExampleSearch) => {
    if (isAiDisabled) {
      toast({
        title: "error",
        description:
          "your selected ai provider is screenpipe-cloud. consider login in app to use screenpipe-cloud",
        variant: "destructive",
      });
      return;
    }
    const newWindowName = example.windowName || "";
    const newAppName = example.appName || "";
    const newLimit = example.limit || limit;
    const newMinLength = example.minLength || minLength;
    const newContentType =
      (example.contentType as "all" | "ocr" | "audio") || contentType;
    const newStartDate = example.startDate;

    setWindowName(newWindowName);
    setAppName(newAppName);
    setLimit(newLimit);
    setMinLength(newMinLength);
    setContentType(newContentType);
    setStartDate(newStartDate);
    setShowExamples(false);

    handleSearch(0, {
      windowName: newWindowName,
      appName: newAppName,
      limit: newLimit,
      minLength: newMinLength,
      contentType: newContentType,
      startDate: newStartDate,
    });
  };

  const generateCurlCommand = () => {
    const baseUrl = "http://localhost:3030";
    const params = {
      content_type: contentType,
      limit: limit.toString(),
      offset: offset.toString(),
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      min_length: minLength.toString(),
      max_length: maxLength.toString(),
      q: query,
      app_name: appName,
      window_name: windowName,
      browser_url: browserUrl,
      include_frames: includeFrames ? "true" : undefined,
    };

    const queryParams = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== "")
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
      .join("&");

    return `curl "${baseUrl}/search?${queryParams}" | jq`;
  };

  useEffect(() => {
    if (results.length > 0) {
      setSelectedResults(new Set(results.map((_, index) => index)));
      setSelectAll(true);
    }
  }, [results]);

  useEffect(() => {
    handleFilterDuplicates();
  }, [debouncedThreshold, results]);

  const handleFilterDuplicates = async () => {
    if (similarityThreshold === 1) {
      setSelectedResults(new Set(results.map((_, index) => index)));
      setSelectAll(true);
      return;
    }
    setIsFiltering(true);
    // simulate a delay to show loading state
    await new Promise((resolve) => setTimeout(resolve, 100));

    const allIndices = new Set(results.map((_, index) => index));
    setSelectedResults(
      removeDuplicateSelections(results, allIndices, debouncedThreshold)
    );
    setSelectAll(false);
    setIsFiltering(false);
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPosition = window.scrollY;
      const scrollPercentage =
        (currentScrollPosition /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;
      const shouldShow = scrollPercentage < 90; // Show when scrolled up more than 10%

      setShowScrollButton(shouldShow);

      // Check if user is scrolling up while AI is loading
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

  const handleResultSelection = (index: number) => {
    setSelectedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const calculateSelectedContentLength = () => {
    return Array.from(selectedResults).reduce((total, index) => {
      const item = results[index];
      if (!item || !item.type) return total; // Add this check

      const contentLength =
        item.type === "OCR"
          ? item.content.text.length
          : item.type === "Audio"
          ? item.content.transcription.length
          : item.type === "UI"
          ? item.content.text.length
          : 0;
      return total + contentLength;
    }, 0);
  };

  const handleFloatingInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floatingInput.trim() && !isStreaming) return;

    if (isStreaming) {
      handleStopStreaming();
      return;
    }

    scrollToBottom();

    const selectedContentLength = calculateSelectedContentLength();
    if (selectedContentLength > MAX_CONTENT_LENGTH) {
      toast({
        title: "Content too large",
        description: `The selected content length (${selectedContentLength} characters) exceeds the maximum allowed (${MAX_CONTENT_LENGTH} characters). Please unselect some items to reduce the amount of content.`,
        variant: "destructive",
      });
      return;
    }

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
      console.log("settings", settings);
      const openai = new OpenAI({
        apiKey:
          settings.aiProviderType === "screenpipe-cloud"
            ? settings.user.token
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "user" as const, // claude does not support system messages?
          content: `You are a helpful assistant specialized as a "${
            selectedAgent.name
          }". ${selectedAgent.systemPrompt}
            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset: ${new Date().getTimezoneOffset()}
            - ${customPrompt ? `Custom prompt: ${customPrompt}` : ""}
            `,
        },
        ...chatMessages.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: `Context data: ${JSON.stringify(
            selectedAgent.dataSelector(
              results.filter((_, index) => selectedResults.has(index))
            )
          )}

          User query: ${floatingInput}`,
        },
      ];

      console.log("messages", messages);

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

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setIsAiLoading(false);
    }
  };

  const handleSearch = async (newOffset = 0, overrides: any = {}) => {
    if (isAiDisabled) {
      toast({
        title: "error",
        description:
          "your ai provider is screenpipe-cloud. consider login in app to use screenpipe-cloud",
        duration: 3000,
        variant: "destructive",
      });
      return;
    }
    await pipe.captureMainFeatureEvent("search", {
      contentType: overrides.contentType || contentType,
      limit: overrides.limit || limit,
      offset: newOffset,
      startDate: overrides.startDate || startDate,
    });
    setHasSearched(true);
    setShowExamples(false);
    setIsLoading(true);
    setOffset(newOffset);
    setProgress(0);
    setChatMessages([]);
    scrollToBottom();
    setResults([]);
    setSimilarityThreshold(1); // Reset similarity threshold to 1

    try {
      // if browserUrl contains special characters like :, /, etc, wrap in double quotes
      // bcs it's FTS
      const bUrl = browserUrl.includes(":") ? `"${browserUrl}"` : browserUrl;
      const wName = windowName.includes(":") ? `"${windowName}"` : windowName;
      const aName = appName.includes(":") ? `"${appName}"` : appName;
      const searchParams = {
        q: query || undefined,
        contentType: overrides.contentType || contentType,
        limit: overrides.limit || limit,
        offset: newOffset,
        startTime:
          overrides.startDate?.toISOString() || startDate.toISOString(),
        endTime: endDate.toISOString(),
        appName: overrides.appName || appName || undefined,
        windowName: overrides.windowName || windowName || undefined,
        browserUrl: bUrl || undefined,
        includeFrames: includeFrames,
        minLength: overrides.minLength || minLength,
        maxLength: maxLength,
        speakerIds: Object.values(selectedSpeakers).map(
          (speaker) => speaker.id
        ),
        ...(frameName && { frame_name: frameName }),
      };

      const response = await pipe.queryScreenpipe(searchParams);

      // Add debug logging
      console.log("search response:", response);

      if (!response || !Array.isArray(response.data)) {
        throw new Error("invalid response data");
      }

      setResults(response.data);
      setTotalResults(response.pagination.total);

      // Save search to history
      // await onAddSearch(searchParams, response.data);
    } catch (error) {
      console.error("search error:", error);
      toast({
        title: "error",
        description: "failed to fetch search results. please try again.",
        variant: "destructive",
      });
      setResults([]);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < totalResults) {
      handleSearch(offset + limit);
    }
  };

  const handlePrevPage = () => {
    if (offset - limit >= 0) {
      handleSearch(offset - limit);
    }
  };

  const handleBadgeClick = (value: string, type: "app" | "window") => {
    if (type === "app") {
      setAppName(value);
    } else if (type === "window") {
      setWindowName(value);
    }
    handleSearch(0);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedResults(new Set(results.map((_, index) => index)));
    } else {
      setSelectedResults(new Set());
    }
  };

  const handleQuickTimeFilter = (minutes: number) => {
    const now = new Date();
    const newStartDate = new Date(now.getTime() - minutes * 60000);
    setStartDate(newStartDate);
    setEndDate(now);
  };

  const renderSearchResults = () => {
    if (isLoading) {
      return Array(3)
        .fill(0)
        .map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-1/4 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ));
    }

    if (hasSearched && results.length === 0) {
      return <p className="text-center">no results found</p>;
    }

    if (!hasSearched || results.length === 0) {
      return null;
    }

    // First filter results based on hideDeselected setting
    const visibleResults = results
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(
        ({ originalIndex }) =>
          !hideDeselected || selectedResults.has(originalIndex)
      );

    return visibleResults.map(({ item, originalIndex }) => (
      <motion.div
        key={originalIndex}
        className="flex items-center mb-4 relative pl-8"
      >
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2">
          <Checkbox
            checked={selectedResults.has(originalIndex)}
            onCheckedChange={() => handleResultSelection(originalIndex)}
          />
        </div>
        <Card className="w-full">
          <CardContent className="p-4">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value={`item-${originalIndex}`}>
                <AccordionTrigger className="flex flex-col w-full py-2">
                  {/* Main content */}
                  <div className="flex w-full items-center gap-2">
                    <span className="text-left truncate">
                      {item.type === "OCR" &&
                        highlightKeyword(
                          getContextAroundKeyword(item.content.text, query),
                          query
                        )}
                      {item.type === "Audio" &&
                        highlightKeyword(
                          getContextAroundKeyword(
                            item.content.transcription,
                            query
                          ),
                          query
                        )}
                      {item.type === "UI" &&
                        highlightKeyword(
                          getContextAroundKeyword(item.content.text, query),
                          query
                        )}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {item.type === "UI" && (
                    <>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.text, query)}
                        </p>
                      </div>
                      <div className="flex justify-center mt-4">
                        <VideoComponent filePath={item.content.filePath} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.content.appName && (
                          <Badge
                            className="text-xs cursor-pointer"
                            onClick={() =>
                              handleBadgeClick(item.content.appName, "app")
                            }
                          >
                            {item.content.appName}
                          </Badge>
                        )}
                        {item.content.windowName && (
                          <Badge
                            className="text-xs cursor-pointer"
                            onClick={() =>
                              handleBadgeClick(
                                item.content.windowName,
                                "window"
                              )
                            }
                          >
                            {item.content.windowName}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                  {item.type === "OCR" && (
                    <>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.text, query)}
                        </p>
                      </div>
                      <div className="flex justify-center mt-4">
                        <VideoComponent filePath={item.content.filePath} />
                      </div>
                      {includeFrames && item.content.frame && (
                        <div className="mt-2 flex items-center">
                          <Dialog>
                            <DialogTrigger asChild>
                              <img
                                src={`data:image/jpeg;base64,${item.content.frame}`}
                                alt="Frame"
                                className="w-24 h-auto cursor-pointer"
                              />
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[80vw]">
                              <img
                                src={`data:image/jpeg;base64,${item.content.frame}`}
                                alt="Frame"
                                className="w-full h-auto"
                              />
                            </DialogContent>
                          </Dialog>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>this is the frame where the text appeared</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </>
                  )}
                  {item.type === "Audio" && (
                    <>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.transcription, query)}
                        </p>
                      </div>
                      {item.content.filePath &&
                      item.content.filePath.trim() !== "" ? (
                        <div className="flex justify-center mt-4">
                          <VideoComponent
                            filePath={item.content.filePath}
                            startTime={item.content.startTime}
                            endTime={item.content.endTime}
                            speaker={item.content.speaker}
                          />
                        </div>
                      ) : (
                        <p className="text-gray-500 italic mt-2">
                          no file path available for this audio.
                        </p>
                      )}
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {item.type}
              </Badge>
              <p className="text-xs text-gray-400">
                {new Date(item.content.timestamp).toLocaleString()}{" "}
                {/* Display local time */}
              </p>
              {item.type === "Audio" && item.content.speaker?.name && (
                <p className="text-xs text-gray-400">
                  {item.content.speaker.name}
                </p>
              )}
              {item.type === "OCR" && item.content.appName && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">app:</span>
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.appName, "app")
                    }
                  >
                    {item.content.appName}
                  </Badge>
                </div>
              )}
              {item.type === "OCR" && item.content.browserUrl && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">url:</span>
                  <div className="flex items-center">
                    <Badge
                      className="text-xs cursor-pointer "
                      title={item.content.browserUrl}
                      onClick={() =>
                        window.open(
                          item.content.browserUrl,
                          "_blank",
                          "noreferrer"
                        )
                      }
                    >
                      {new URL(item.content.browserUrl).hostname}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5 ml-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(item.content.browserUrl!);
                        toast({
                          title: "copied",
                          description: "url copied to clipboard",
                          duration: 2000,
                        });
                      }}
                      title="copy url"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
              {item.type === "OCR" && item.content.windowName && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">window:</span>
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.windowName, "window")
                    }
                  >
                    {item.content.windowName}
                  </Badge>
                </div>
              )}
              {"tags" in item.content &&
                item.content.tags &&
                item.content.tags.map((tag: string, index: number) => (
                  <Badge key={index} className="text-xs">
                    {tag}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    ));
  };

  // Add effect to restore search when currentSearchId changes
  useEffect(() => {
    // if (currentSearchId) {
    const selectedSearch = searches.find((s) => s.id === currentSearchId);
    if (selectedSearch) {
      // Restore search parameters
      setQuery(selectedSearch.searchParams.q || "");
      setContentType(selectedSearch.searchParams.content_type);
      setLimit(selectedSearch.searchParams.limit);
      setStartDate(new Date(selectedSearch.searchParams.start_time));
      setEndDate(new Date(selectedSearch.searchParams.end_time));
      setAppName(selectedSearch.searchParams.app_name || "");
      setWindowName(selectedSearch.searchParams.window_name || "");
      setIncludeFrames(selectedSearch.searchParams.include_frames);
      setMinLength(selectedSearch.searchParams.min_length);
      setMaxLength(selectedSearch.searchParams.max_length);

      // Restore results
      setResults(selectedSearch.results);
      setTotalResults(selectedSearch.results.length);
      setHasSearched(true);
      setShowExamples(false);

      // Restore messages if any
      if (selectedSearch.messages) {
        setChatMessages(
          selectedSearch.messages.map((msg) => ({
            id: msg.id,
            role: msg.type === "ai" ? "assistant" : "user",
            content: msg.content,
          }))
        );
      }
    }
    // }
  }, [currentSearchId, searches]);

  const handleNewSearch = () => {
    // setCurrentSearchId(null);
    location.reload();
    // Add any other reset logic you need
  };

  // Add this effect near other useEffect hooks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Shift (macOS) or Ctrl+Shift (Windows/Linux)
      if (
        e.shiftKey &&
        ((currentPlatform === "macos" && e.metaKey) ||
          (currentPlatform !== "macos" && e.ctrlKey)) &&
        !e.altKey && // ensure alt/option isn't pressed
        !e.key.match(/^[a-zA-Z0-9]$/) // prevent triggering on letter/number keys
      ) {
        e.preventDefault();
        if (floatingInputRef.current && results.length > 0) {
          handleFloatingInputSubmit(new Event("submit") as any);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPlatform, results.length, floatingInput, isStreaming]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 mt-12">
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        {/* <SidebarTrigger className="h-8 w-8" /> */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewSearch}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-center mb-16">
        {/* Add the new SearchFilterGenerator component */}
        <SearchFilterGenerator
          onApplyFilters={(filters) => {
            // Always use empty string instead of undefined for text inputs
            setQuery(filters.query ?? "");
            setAppName(filters.appName ?? "");
            setWindowName(filters.windowName ?? "");

            // Use default values for other types
            handleContentTypeFromFilter(filters.contentType ?? "all");
            setStartDate(
              filters.startDate ?? new Date(Date.now() - 24 * 3600000)
            );
            setEndDate(filters.endDate ?? new Date());
            setLimit(filters.limit ?? 30);

            // Automatically perform search with new filters
            handleSearch(0);
          }}
        />
      </div>
      {/* Content Type Checkboxes and Code Button */}
      <div className="flex items-center justify-center mb-4 gap-4">
        {/* Remove MultiSelectCombobox from here */}

        {/* Add browser URL input */}
        {currentPlatform === "macos" && (
          <SqlAutocompleteInput
            id="browser-url"
            type="url"
            value={browserUrl}
            onChange={setBrowserUrl}
            placeholder="filter by browser URL"
            className="w-[350px]"
            icon={<Search className="h-4 w-4" />}
          />
        )}

        {/* Window name filter - increased width */}
        <SqlAutocompleteInput
          id="window-name"
          type="window"
          value={windowName}
          onChange={setWindowName}
          placeholder="filter by window"
          className="w-[350px]"
          icon={<Layout className="h-4 w-4" />}
        />

        {/* Advanced button */}
        <Button
          variant="outline"
          onClick={() => setIsQueryParamsDialogOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => handleSearch(0)}
                  disabled={
                    isLoading ||
                    isAiDisabled ||
                    !health ||
                    health?.status === "error"
                  }
                  className="disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      {currentPlatform === "macos" ? "⌘" : "ctrl"} + ↵
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {(!health || health?.status === "error" || isAiDisabled) && (
              <TooltipContent>
                <p>
                  {isAiDisabled && isServerDown ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      you don't have access to screenpipe-cloud <br /> and
                      screenpipe server is down!
                    </>
                  ) : isServerDown ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      screenpipe is not running...
                    </>
                  ) : isAiDisabled ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      you don't have access to screenpipe-cloud :( <br /> please
                      consider login!
                    </>
                  ) : (
                    ""
                  )}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Quick time filter badges */}
      <div className="flex mt-2 mb-4 space-x-2 justify-center">
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={() => handleQuickTimeFilter(30)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 30m
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={() => handleQuickTimeFilter(60)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 60m
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={() => handleQuickTimeFilter(24 * 60)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 24h
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={() => handleQuickTimeFilter(7 * 24 * 60)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 7d
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={() => handleQuickTimeFilter(30 * 24 * 60)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 30d
        </Badge>
      </div>

      <Dialog
        open={isQueryParamsDialogOpen}
        onOpenChange={setIsQueryParamsDialogOpen}
      >
        <DialogContent className="sm:max-w-[605px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>advanced search parameters</DialogTitle>
            <DialogDescription>
              adjust additional search parameters here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Add the curl command button at the top */}
            <div className="flex justify-end">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="text-sm">
                    <IconCode className="h-4 w-4 mx-2" />
                    curl command
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>curl command</DialogTitle>
                    <DialogDescription>
                      you can use this curl command to make the same search
                      request from the command line.
                      <br />
                      <br />
                      <span className="text-xs text-gray-500">
                        note: you need to have `jq` installed to use the
                        command.
                      </span>{" "}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-x-auto">
                    <CodeBlock language="bash" value={generateCurlCommand()} />
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Move content type selection here */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="content-type" className="text-right">
                content type
              </Label>
              <div className="col-span-3">
                <MultiSelectCombobox
                  label="content type"
                  options={contentTypeOptions}
                  value={selectedContentTypes}
                  onChange={handleContentTypeChange}
                  placeholder="Filter by content type..."
                  renderItem={(option) => (
                    <div className="flex items-center justify-between w-full">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground items-end">
                        {contentTypeDescriptions[option.value]}
                      </span>
                    </div>
                  )}
                  renderSelectedItem={(values) => (
                    <div className="flex gap-1 items-center">
                      {values.length === 0 ? (
                        <span>All content types</span>
                      ) : (
                        <>
                          {values.map((value) => {
                            const option = contentTypeOptions.find(
                              (opt) => opt.value === value
                            );
                            return option ? (
                              <Badge
                                key={value}
                                variant="secondary"
                                className="gap-1 px-1.5"
                              >
                                {option.label}
                              </Badge>
                            ) : null;
                          })}
                        </>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>

            {/* Add keyword search field */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="keyword-search" className="text-right">
                keyword search
              </Label>
              <div className="col-span-3 flex items-center">
                <Input
                  id="keyword-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search for specific keywords"
                  className="flex-grow"
                  autoCorrect="off"
                  autoComplete="off"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>search for specific keywords in all content</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Add browser URL field in advanced settings too */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="browser-url" className="text-right">
                browser URL
              </Label>
              <div className="col-span-3 flex items-center">
                <Input
                  id="browser-url"
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  placeholder="filter by browser URL"
                  className="flex-grow"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>filter results by specific browser URLs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Add date pickers here */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="start-date" className="text-right">
                start date
              </Label>
              <div className="col-span-3">
                <DateTimePicker
                  date={startDate}
                  setDate={setStartDate}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="end-date" className="text-right">
                end date
              </Label>
              <div className="col-span-3">
                <DateTimePicker
                  date={endDate}
                  setDate={setEndDate}
                  className="w-full"
                />
              </div>
            </div>

            {/* Rest of the advanced settings content */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="app-name" className="text-right">
                app name
              </Label>
              <div className="col-span-3 flex items-center">
                <SqlAutocompleteInput
                  id="app-name"
                  type="app"
                  icon={<Laptop className="h-4 w-4" />}
                  value={appName}
                  onChange={setAppName}
                  placeholder="filter by app name"
                  className="flex-grow"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>filter results by specific application names</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="min-length" className="text-right">
                min length
              </Label>
              <div className="col-span-3 flex items-center">
                <Input
                  id="min-length"
                  type="number"
                  value={minLength}
                  onChange={(e) => setMinLength(Number(e.target.value))}
                  className="flex-grow"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        enter the minimum length of the content to search for
                        <br />
                        usually transcriptions are short while text extracted
                        from images can be long.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max-length" className="text-right">
                max length
              </Label>
              <div className="col-span-3 flex items-center">
                <Input
                  id="max-length"
                  type="number"
                  value={maxLength}
                  onChange={(e) => setMaxLength(Number(e.target.value))}
                  className="flex-grow"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        enter the maximum length of the content to search for
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="limit-slider" className="text-right">
                page size: {limit}
              </Label>
              <div className="col-span-3 flex items-center">
                <Slider
                  id="limit-slider"
                  value={[limit]}
                  onValueChange={(value: number[]) => setLimit(value[0])}
                  min={10}
                  max={15000}
                  step={10}
                  className="flex-grow"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        select the number of results to display. usually ai
                        cannot ingest more than 30 OCR results at a time and
                        1000 audio results at a time.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="speakers" className="text-right">
              speakers
            </Label>
            <div className="col-span-3 flex items-center">
              <Popover open={openSpeakers} onOpenChange={setOpenSpeakers}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openSpeakers}
                    className="w-full justify-between"
                  >
                    {Object.values(selectedSpeakers).length > 0
                      ? `${Object.values(selectedSpeakers)
                          .map((s) => s.name)
                          .join(", ")}`
                      : "select speakers"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="search speakers..."
                      value={speakerSearchQuery}
                      onValueChange={setSpeakerSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>no speakers found.</CommandEmpty>
                      <CommandGroup>
                        {[...new Set(speakers)].map((speaker: Speaker) => (
                          <CommandItem
                            key={speaker.id}
                            value={speaker.name}
                            onSelect={() => handleSpeakerChange(speaker)}
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedSpeakers[speaker.id]
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <span
                                style={{
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  MozUserSelect: "none",
                                  msUserSelect: "none",
                                }}
                              >
                                {speaker.name}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {/* Add frame name input after app name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="frame-name" className="text-right">
              frame name
            </Label>
            <div className="col-span-3 flex items-center">
              <Input
                id="frame-name"
                type="text"
                value={frameName}
                onChange={(e) => setFrameName(e.target.value)}
                placeholder="filter by frame name"
                className="flex-grow"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      filter results by specific frame names (by default frame
                      name is mp4 video file path)
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Switch
              id="include-frames"
              checked={includeFrames}
              onCheckedChange={setIncludeFrames}
            />
            <Label htmlFor="include-frames">include frames</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    include frames in the search results. this shows the frame
                    where the text appeared. only works for ocr. this may slow
                    down the search.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsQueryParamsDialogOpen(false)}>
              done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="my-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        showExamples &&
        results.length === 0 && (
          <div className="my-8 flex justify-center">
            <ExampleSearchCards onSelect={handleExampleSelect} />
          </div>
        )
      )}
      {isLoading && (
        <div className="my-2">
          <Progress value={progress} className="w-full" />
        </div>
      )}
      {results.length > 0 && (
        <div className="flex flex-col space-y-4 mb-4 my-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all">select all results</Label>
              </div>

              <Separator orientation="vertical" className="h-4" />

              <div className="flex items-center space-x-2">
                <Switch
                  id="hide-deselected"
                  checked={hideDeselected}
                  onCheckedChange={setHideDeselected}
                />
                <Label htmlFor="hide-deselected">hide unselected</Label>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {}}
                disabled={isFiltering}
                className="flex items-center gap-2 disabled:opacity-100"
              >
                {isFiltering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : similarityThreshold === 0.5 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                {similarityThreshold === 0.5
                  ? "duplicates removed"
                  : "remove duplicates"}
              </Button>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>automatically unselect similar or duplicate results</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {renderSearchResults()}
        {totalResults > 0 && (
          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={handlePrevPage}
              disabled={offset === 0}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-gray-500">
              Showing {offset + 1} - {Math.min(offset + limit, totalResults)} of{" "}
              {totalResults}
            </span>
            <Button
              onClick={handleNextPage}
              disabled={offset + limit >= totalResults}
              variant="outline"
              size="sm"
            >
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {results.length > 0 && (
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
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-muted-foreground">
                        <Bot className="h-4 w-4 mr-2" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>using {settings.aiModel}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip open={!isAvailable}>
                    <TooltipTrigger asChild>
                      <div className="flex-1">
                        <Input
                          ref={floatingInputRef}
                          type="text"
                          placeholder="ask a question about the results..."
                          value={floatingInput}
                          disabled={
                            calculateSelectedContentLength() >
                              MAX_CONTENT_LENGTH ||
                            isAiDisabled ||
                            !isAvailable
                          }
                          onChange={(e) => setFloatingInput(e.target.value)}
                          className="flex-1 h-12 focus:outline-none focus:ring-0 border-0 focus:border-black dark:focus:border-white focus:border-b transition-all duration-200"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-sm text-destructive">{error}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Select
                  value={selectedAgent.id}
                  onValueChange={(value) =>
                    setSelectedAgent(
                      AGENTS.find((a) => a.id === value) || AGENTS[0]
                    )
                  }
                >
                  <SelectTrigger
                    className="w-[170px] h-12"
                    title={selectedAgent.description}
                  >
                    <SelectValue placeholder="select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENTS.map((agent) => (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        title={
                          AGENTS.find((a) => a.id === agent.id)?.description
                        }
                      >
                        <span className="font-mono text-sm">{agent.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="submit"
                  className="w-12"
                  disabled={
                    calculateSelectedContentLength() > MAX_CONTENT_LENGTH ||
                    isAiDisabled
                  }
                  title={
                    isAiDisabled
                      ? "Please sign in to use AI features"
                      : `${currentPlatform === "macos" ? "⌘" : "ctrl"}+shift`
                  }
                >
                  {isStreaming ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <div className="flex items-center">
                      <Send className="h-4 w-4" />
                      <span className="sr-only">
                        {currentPlatform === "macos" ? "⌘" : "ctrl"}+shift
                      </span>
                    </div>
                  )}
                </Button>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <ContextUsageIndicator
                          currentSize={calculateSelectedContentLength()}
                          maxSize={MAX_CONTENT_LENGTH}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">
                        {calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                          ? `selected content exceeds maximum allowed: ${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters. unselect some items to use AI.`
                          : `${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters used for AI message`}
                        <br />
                        <span className="text-muted-foreground mt-1 block">
                          ai models can only process a limited amount of text at
                          once. the circle indicates your current usage.
                        </span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {results.length > 0 && <Separator className="my-8" />}

      {/* Display chat messages - Update this section */}
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

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <Button
          className="fixed bottom-4 right-4 rounded-full p-2"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-6 w-6" />
        </Button>
      )}
      {results.length > 0 && <div className="h-32" />}
    </div>
  );
}
