import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryScreenpipe, ContentItem } from "@/lib/screenpipe";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  AlertCircle,
  AlignLeft,
  Calendar,
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
  X,
  Square,
  Settings,
  Clock,
  Check,
} from "lucide-react";
import { useToast } from "./ui/use-toast";
import posthog from "posthog-js";
import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "@/lib/hooks/use-settings";
import { convertToCoreMessages, generateId, Message, streamText } from "ai";
import { OpenAI } from "openai";
import { ChatMessage } from "./chat-message-v2";
import { spinner } from "./spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { VideoComponent } from "./video";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "./ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Separator } from "./ui/separator";
import { ContextUsageIndicator } from "./context-usage-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { formatISO } from "date-fns";
import { IconCode } from "@/components/ui/icons";
import { CodeBlock } from "./ui/codeblock";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import { encode, removeDuplicateSelections } from "@/lib/utils";
import { ExampleSearch, ExampleSearchCards } from "./example-search-cards";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { SearchHistory } from "@/lib/types/history";

interface SearchChatProps {
  currentSearchId: string | null;
  onAddSearch: (searchParams: any, results: any[]) => Promise<string>;
  searches: SearchHistory[];
}

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
            (item.content.app_name || item.content.window_name)
        )
        .map((item) => ({
          timestamp: item.content.timestamp,
          // @ts-ignore
          app_name: item.content.app_name,
          // @ts-ignore
          window_name: item.content.window_name,
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
          app_name: item.content.app_name,
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

export function SearchChat({
  currentSearchId,
  onAddSearch,
  searches,
}: SearchChatProps) {
  // Search state
  const { health } = useHealthCheck();
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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [minLength, setMinLength] = useState(50);
  const [maxLength, setMaxLength] = useState(10000);

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
  const [hoveredResult, setHoveredResult] = useState<number | null>(null);

  const [isCurlDialogOpen, setIsCurlDialogOpen] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectAll, setSelectAll] = useState(true);

  const [showExamples, setShowExamples] = useState(true);

  const [hasSearched, setHasSearched] = useState(false);

  const [isFiltering, setIsFiltering] = useState(false);
  const debouncedThreshold = useDebounce(similarityThreshold, 300);

  const [isQueryParamsDialogOpen, setIsQueryParamsDialogOpen] = useState(false);

  // Add state for individual content types
  const [selectedTypes, setSelectedTypes] = useState({
    ocr: false,
    audio: false,
    ui: false,
  });

  // Add new state near the top with other state declarations
  const [hideDeselected, setHideDeselected] = useState(false);

  // Update content type when checkboxes change
  const handleContentTypeChange = (type: "ocr" | "audio" | "ui") => {
    const newTypes = { ...selectedTypes, [type]: !selectedTypes[type] };
    setSelectedTypes(newTypes);

    // Convert checkbox state to content type
    if (!newTypes.ocr && !newTypes.audio && !newTypes.ui) {
      setContentType("all"); // fallback to all if nothing selected
    } else if (newTypes.audio && newTypes.ui && !newTypes.ocr) {
      setContentType("audio+ui");
    } else if (newTypes.ocr && newTypes.ui && !newTypes.audio) {
      setContentType("ocr+ui");
    } else if (newTypes.audio && newTypes.ocr && !newTypes.ui) {
      setContentType("audio+ocr");
    } else if (newTypes.audio) {
      setContentType("audio");
    } else if (newTypes.ocr) {
      setContentType("ocr");
    } else if (newTypes.ui) {
      setContentType("ui"); // This was missing - single UI type
    } else {
      setContentType("all");
    }
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

  const handleExampleSelect = async (example: ExampleSearch) => {
    posthog.capture("example_search", { example: example.title });

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
          : item.type === "FTS"
          ? item.content.matched_text.length
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

    // Track AI usage metrics
    posthog.capture("ai_chat_usage", {
      agent: selectedAgent.name,
      total_chars: floatingInput.length + selectedContentLength
    });

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
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });
      console.log("openai", settings.openaiApiKey, settings.aiUrl);

      posthog.capture("ai_search", {
        ai_url: settings.aiUrl,
        model: settings.aiModel,
      });

      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "system" as const,
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
      if (error.toString().includes("aborted")) {
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
    setHasSearched(true);
    setShowExamples(false);
    setIsLoading(true);
    setOffset(newOffset);
    setProgress(0);
    setChatMessages([]);
    scrollToBottom();
    setResults([]);
    setSimilarityThreshold(1); // Reset similarity threshold to 1

    posthog.capture("search", {
      contentType: overrides.contentType || contentType,
      limit: overrides.limit || limit,
      offset: newOffset,
      start_time: overrides.startDate?.toISOString() || startDate.toISOString(),
      end_time: endDate.toISOString(),
      min_length: overrides.minLength || minLength,
      max_length: maxLength,
    });

    try {
      const searchParams = {
        q: query || undefined,
        content_type: overrides.contentType || contentType,
        limit: overrides.limit || limit,
        offset: newOffset,
        start_time:
          overrides.startDate?.toISOString() || startDate.toISOString(),
        end_time: endDate.toISOString(),
        app_name: overrides.appName || appName || undefined,
        window_name: overrides.windowName || windowName || undefined,
        include_frames: includeFrames,
        min_length: overrides.minLength || minLength,
        max_length: maxLength,
      };

      const response = await queryScreenpipe(searchParams);

      // Add debug logging
      console.log("search response:", response);

      if (!response || !Array.isArray(response.data)) {
        throw new Error("invalid response data");
      }

      setResults(response.data);
      setTotalResults(response.pagination.total);

      // Save search to history
      await onAddSearch(searchParams, response.data);
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
    } else {
      setWindowName(value);
    }
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
                      {item.type === "FTS" &&
                        highlightKeyword(
                          getContextAroundKeyword(
                            item.content.matched_text,
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
                        <VideoComponent filePath={item.content.file_path} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.content.app_name && (
                          <Badge
                            className="text-xs cursor-pointer"
                            onClick={() =>
                              handleBadgeClick(item.content.app_name, "app")
                            }
                          >
                            {item.content.app_name}
                          </Badge>
                        )}
                        {item.content.window_name && (
                          <Badge
                            className="text-xs cursor-pointer"
                            onClick={() =>
                              handleBadgeClick(
                                item.content.window_name,
                                "window"
                              )
                            }
                          >
                            {item.content.window_name}
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
                        <VideoComponent filePath={item.content.file_path} />
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
                      {item.content.file_path &&
                      item.content.file_path.trim() !== "" ? (
                        <div className="flex justify-center mt-4">
                          <VideoComponent filePath={item.content.file_path} />
                        </div>
                      ) : (
                        <p className="text-gray-500 italic mt-2">
                          no file path available for this audio.
                        </p>
                      )}
                    </>
                  )}
                  {item.type === "FTS" && (
                    <>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.matched_text, query)}
                        </p>
                        {item.content.original_frame_text && (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                            original: {item.content.original_frame_text}
                          </p>
                        )}
                      </div>
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
              {item.type === "OCR" && item.content.app_name && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">app:</span>
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.app_name, "app")
                    }
                  >
                    {item.content.app_name}
                  </Badge>
                </div>
              )}
              {item.type === "OCR" && item.content.window_name && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">window:</span>
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.window_name, "window")
                    }
                  >
                    {item.content.window_name}
                  </Badge>
                </div>
              )}
              {item.content.tags &&
                item.content.tags.map((tag, index) => (
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
    if (currentSearchId) {
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
    }
  }, [currentSearchId, searches]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 mt-12">
      {/* Content Type Checkboxes and Code Button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <Checkbox
              id="audio-type"
              checked={selectedTypes.audio}
              onCheckedChange={() => handleContentTypeChange("audio")}
              className="h-4 w-4"
            />
            <Label htmlFor="audio-type" className="text-xs">
              speech
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground ml-0.5" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>audio transcripts</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {settings.platform === "macos" && (
            <div className="flex items-center space-x-1">
              <Checkbox
                id="ui-type"
                checked={selectedTypes.ui}
                onCheckedChange={() => handleContentTypeChange("ui")}
                className="h-4 w-4"
              />
              <Label htmlFor="ui-type" className="text-xs">
                screen UI
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground ml-0.5" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      text emitted directly from the source code of the desktop
                      applications
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          <div className="flex items-center space-x-1">
            <Checkbox
              id="ocr-type"
              checked={selectedTypes.ocr}
              onCheckedChange={() => handleContentTypeChange("ocr")}
              className="h-4 w-4"
            />
            <Label htmlFor="ocr-type" className="text-xs">
              screen capture
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground ml-0.5" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    recognized text from screenshots taken every 5s by default
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <Dialog open={isCurlDialogOpen} onOpenChange={setIsCurlDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-sm">
              <IconCode className="h-4 w-4 mx-2" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>curl command</DialogTitle>
              <DialogDescription>
                you can use this curl command to make the same search request
                from the command line.
                <br />
                <br />
                <span className="text-xs text-gray-500">
                  note: you need to have `jq` installed to use the command.
                </span>{" "}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <CodeBlock language="bash" value={generateCurlCommand()} />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Existing search bar and other controls */}
      <div className="flex items-center gap-4 mb-4">
        {/* Keyword search - smaller width */}
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch(0);
            }
          }}
          placeholder="keyword search, you may leave it blank"
          className="w-[350px]"
        />

        {/* Window name filter - increased width */}
        <SqlAutocompleteInput
          id="window-name"
          type="window"
          value={windowName}
          onChange={setWindowName}
          placeholder="filter by window"
          className="w-[300px]"
          icon={<Layout className="h-4 w-4" />}
        />

        {/* Advanced button */}
        <Button
          variant="outline"
          onClick={() => setIsQueryParamsDialogOpen(true)}
        >
          advanced
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => handleSearch(0)}
                  disabled={isLoading || !health || health?.status === "error"}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      search
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {health?.status === "error" && (
              <TooltipContent>
                <p>screenpipe is not running...</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex-grow space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="start-date">start date</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>select the start date to search for content</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DateTimePicker
            date={startDate}
            setDate={setStartDate}
            className="w-full"
          />
        </div>

        <div className="flex-grow space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="end-date">end date</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>select the end date to search for content</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DateTimePicker
            date={endDate}
            setDate={setEndDate}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex mt-4 space-x-2 justify-center">
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
        <DialogContent className="sm:max-w-[605px]">
          <DialogHeader>
            <DialogTitle>advanced search parameters</DialogTitle>
            <DialogDescription>
              adjust additional search parameters here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Remove the query section */}
            {/* <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="query" className="text-right">
                query
              </Label>
              ... query input ...
            </div> */}

            {/* Keep other advanced search options */}
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
                  max={150}
                  step={5}
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
                onClick={() => {
                  setSimilarityThreshold(similarityThreshold === 0.5 ? 1 : 0.5);
                  if (similarityThreshold === 0.5) {
                    setSelectedResults(
                      new Set(results.map((_, index) => index))
                    );
                    setSelectAll(true);
                  }
                }}
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
                <Input
                  ref={floatingInputRef}
                  type="text"
                  placeholder="ask a question about the results..."
                  value={floatingInput}
                  disabled={
                    calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                  }
                  onChange={(e) => setFloatingInput(e.target.value)}
                  className="flex-1 h-12 focus:outline-none focus:ring-0 border-0 focus:border-black dark:focus:border-white focus:border-b transition-all duration-200"
                />

                <Select
                  value={selectedAgent.id}
                  onValueChange={(value) =>
                    setSelectedAgent(
                      AGENTS.find((a) => a.id === value) || AGENTS[0]
                    )
                  }
                >
                  <SelectTrigger className="w-[170px] h-12">
                    <SelectValue placeholder="select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENTS.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="font-mono text-sm">{agent.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{selectedAgent.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  type="submit"
                  className="w-12"
                  disabled={
                    calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                  }
                >
                  {isStreaming ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ContextUsageIndicator
                        currentSize={calculateSelectedContentLength()}
                        maxSize={MAX_CONTENT_LENGTH}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                          ? `selected content exceeds maximum allowed: ${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters. unselect some items to use AI.`
                          : `${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters used for AI message`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground ml-1 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">
                        ai models can only process a limited amount of text at
                        once.
                        <br />
                        this circle shows how much of that limit you arere
                        using.
                        <br />! the exclamation mark indicates when you exceed
                        the limit.
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
