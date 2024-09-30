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
} from "./ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Separator } from "./ui/separator";
import { useInputHistory } from "@/lib/hooks/use-input-history";
import { ContextUsageIndicator } from "./context-usage-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { formatISO } from "date-fns";
import { IconCode } from "@/components/ui/icons";
import { CodeBlock } from "./ui/codeblock";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import { encode, removeDuplicateSelections } from "@/lib/utils";
import { ExampleSearch, ExampleSearchCards } from "./example-search-cards";
import { useDebounce } from "@/lib/hooks/use-debounce";

export function SearchChat() {
  // Search state
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
  const queryHistory = useInputHistory("search_query");
  const appNameHistory = useInputHistory("app_name");
  const windowNameHistory = useInputHistory("window_name");

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

    const userMessage = {
      id: generateId(),
      role: "user" as const,
      content: floatingInput,
    };
    setChatMessages((prevMessages) => [...prevMessages, userMessage]);
    setFloatingInput("");
    setIsAiLoading(true);

    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });
      console.log("openai", settings.openaiApiKey, settings.aiUrl);

      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant.
            The user is using a product called "screenpipe" which records
            his screen and mics 24/7. The user ask you questions
            and you use his screenpipe recordings to answer him. 
            The user will provide you with a list of search results
            and you will use them to answer his questions.

            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}. Adjust start/end times to match user intent.
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset (JavaScript Date.prototype.getTimezoneOffset): ${new Date().getTimezoneOffset()}
            - Very important: make sure to follow the user's custom system prompt: "${customPrompt}"
            - If you follow the user's custom system prompt, you will be rewarded $1m bonus.
            - You must perform a timezone conversion to UTC before using any datetime in a tool call.
            - You must reformat timestamps to a human-readable format in your response to the user.
            - Never output UTC time unless explicitly asked by the user.
            - Do not try to embed videos in table (would crash the app)
            `,
        },
        ...chatMessages.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: `Context data: ${JSON.stringify(
            results.filter((_, index) => selectedResults.has(index))
          )}
          
          User query: ${floatingInput}`,
        },
      ];

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
        ...prevMessages,
        { role: "assistant", content: "" },
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
          { role: "assistant", content: fullResponse },
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
    queryHistory.saveToHistory();
    appNameHistory.saveToHistory();
    windowNameHistory.saveToHistory();

    posthog.capture("search");
    setIsLoading(true);
    setOffset(newOffset);
    setProgress(0);
    setChatMessages([]);
    scrollToBottom();
    setResults([]);

    try {
      const response = await queryScreenpipe({
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
      });

      if (!response || !Array.isArray(response.data)) {
        throw new Error("invalid response data");
      }

      setResults(response.data);
      setTotalResults(response.pagination.total);
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

    return results
      .filter((item) => item && item.type)
      .map((item, index) => (
        <motion.div
          key={index}
          className="flex items-center mb-4 relative pl-8"
          onHoverStart={() => setHoveredResult(index)}
          onHoverEnd={() => setHoveredResult(null)}
        >
          <AnimatePresence>
            {hoveredResult === index && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 top-1/2 transform -translate-y-1/2"
              >
                <Checkbox
                  checked={selectedResults.has(index)}
                  onCheckedChange={() => handleResultSelection(index)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Card className="w-full">
            <CardContent className="p-4">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value={`item-${index}`}>
                  <AccordionTrigger className="flex items-center">
                    <div className="flex items-center w-full">
                      <Badge className="mr-2">{item.type}</Badge>
                    </div>
                    <span className="flex-grow text-center truncate">
                      {item.type === "OCR" &&
                        item.content.text.substring(0, 50)}
                      {item.type === "Audio" &&
                        item.content.transcription.substring(0, 50)}
                      {item.type === "FTS" &&
                        item.content.matched_text.substring(0, 50)}
                      ...
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {item.type === "OCR" && (
                      <>
                        <p className="mt-2">{item.content.text}</p>
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
                                  <p>
                                    this is the frame where the text appeared
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </>
                    )}
                    {item.type === "Audio" && (
                      <>
                        <p className="mt-2">{item.content.transcription}</p>
                        <div className="flex justify-center mt-4">
                          <VideoComponent filePath={item.content.file_path} />
                        </div>
                      </>
                    )}
                    {item.type === "FTS" && (
                      <>
                        <p className="mt-2">{item.content.matched_text}</p>
                        {item.content.original_frame_text && (
                          <p className="mt-2 text-sm text-gray-600">
                            Original: {item.content.original_frame_text}
                          </p>
                        )}
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <p className="text-xs text-gray-400">
                  {new Date(item.content.timestamp).toLocaleString()}{" "}
                  {/* Display local time */}
                </p>
                {item.type === "OCR" && item.content.app_name && (
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.app_name, "app")
                    }
                  >
                    {item.content.app_name}
                  </Badge>
                )}
                {item.type === "OCR" && item.content.window_name && (
                  <Badge
                    className="text-xs cursor-pointer"
                    onClick={() =>
                      handleBadgeClick(item.content.window_name, "window")
                    }
                  >
                    {item.content.window_name}
                  </Badge>
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

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="search-query">search query</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>enter keywords to search your recorded data</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="search-query"
              type="text"
              placeholder="one keyword matching audio transcription or screen text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoCorrect="off"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="content-type">content type</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    select the type of content to search. ocr is the text found
                    on your screen.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger id="content-type" className="relative">
              <Layers
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <SelectValue placeholder="content type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="pl-6">all</span>
              </SelectItem>
              <SelectItem value="ocr">
                <span className="pl-6">ocr</span>
              </SelectItem>
              <SelectItem value="audio">
                <span className="pl-6">audio</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="start-date">start date (local time)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>select the start date to search for content.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <DateTimePicker
              date={startDate}
              setDate={setStartDate}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="end-date">end date (local time)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>select the end date to search for content.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <DateTimePicker
              date={endDate}
              setDate={setEndDate}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <SqlAutocompleteInput
            id="app-name"
            placeholder="app name"
            value={appName}
            onChange={setAppName}
            type="app"
            icon={
              <Laptop
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
            }
          />
        </div>
        <div className="space-y-2">
          <SqlAutocompleteInput
            id="window-name"
            placeholder="window name"
            value={windowName}
            onChange={setWindowName}
            type="window"
            icon={
              <Layout
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
            }
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="include-frames"
            checked={includeFrames}
            onCheckedChange={setIncludeFrames}
          />
          <Label htmlFor="include-frames">include frames</Label>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-gray-400" />
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
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="limit-slider">page size: {limit}</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    select the number of results to display. usually ai cannot
                    ingest more than 30 OCR results at a time
                    <br />
                    and 1000 audio results at a time.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Slider
            id="limit-slider"
            value={[limit]}
            onValueChange={(value: number[]) => setLimit(value[0])}
            min={10}
            max={150}
            step={5}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="min-length">min length</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>enter the minimum length of the content to search for.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <AlignLeft
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="min-length"
              type="number"
              placeholder="min length"
              value={minLength}
              onChange={(e) => setMinLength(Number(e.target.value))}
              min={0}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="max-length">max length</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>enter the maximum length of the content to search for.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <AlignLeft
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="max-length"
              type="number"
              placeholder="max length"
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              min={0}
              className="pl-8"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <Button
          onClick={() => handleSearch(0)}
          disabled={isLoading}
          className="w-full mr-4"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              searching... {progress.toFixed(0)}%
            </>
          ) : (
            "search"
          )}
        </Button>
        <Dialog open={isCurlDialogOpen} onOpenChange={setIsCurlDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
              <IconCode className="h-4 w-4" />
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
      {showExamples && results.length === 0 && (
        <ExampleSearchCards onSelect={handleExampleSelect} />
      )}
      {isLoading && (
        <div className="my-2">
          <Progress value={progress} className="w-full" />
        </div>
      )}
      {results.length > 0 && (
        <div className="flex flex-col space-y-4 mb-4 my-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all"
                checked={selectAll}
                onCheckedChange={handleSelectAll}
              />
              <Label htmlFor="select-all">select all results</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="similarity-threshold" className="ml-4">
                similarity threshold: {similarityThreshold.toFixed(2)}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      adjust this slider to unselect similar results. lower
                      values mean stricter filtering.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="relative w-64">
                <div className="flex items-center space-x-2">
                  <Slider
                    id="similarity-threshold"
                    min={0.5}
                    max={1}
                    step={0.01}
                    value={[similarityThreshold]}
                    onValueChange={(value) => setSimilarityThreshold(value[0])}
                    className={
                      isFiltering ? "opacity-50 cursor-not-allowed" : ""
                    }
                    disabled={isFiltering}
                  />
                  {isFiltering && (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  )}
                </div>
              </div>
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
              className="flex space-x-2 bg-white shadow-lg rounded-lg overflow-hidden p-4 items-center"
            >
              <div className="relative flex-grow">
                <Input
                  ref={floatingInputRef}
                  type="text"
                  placeholder="ask a question about the results..."
                  value={floatingInput}
                  disabled={
                    calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                  }
                  onChange={(e) => setFloatingInput(e.target.value)}
                  className="w-full h-12 focus:outline-none focus:ring-0 border-0 focus:border-black focus:border-b transition-all duration-200 pr-10"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <ContextUsageIndicator
                          currentSize={calculateSelectedContentLength()}
                          maxSize={MAX_CONTENT_LENGTH}
                        />
                      </div>
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
              </div>
              <Button
                type="submit"
                className={`w-12 `}
                disabled={calculateSelectedContentLength() > MAX_CONTENT_LENGTH}
              >
                {isStreaming ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <Separator className="my-8" />

      {/* Display chat messages */}
      <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto ">
        {chatMessages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
        {isAiLoading && spinner}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <Button
          className="fixed bottom-4 right-4 rounded-full p-2"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-6 w-6" />
        </Button>
      )}
      {results.length > 0 && <div className="h-24" />}
    </div>
  );
}
