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
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "./date-time-picker";
import { Badge } from "./ui/badge";
import {
  AlertCircle,
  AlignLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Laptop,
  Layers,
  Layout,
  Loader2,
  Search,
  Send,
} from "lucide-react";
import { useToast } from "./ui/use-toast";
import posthog from "posthog-js";
import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "@/lib/hooks/use-settings";
import { convertToCoreMessages, generateId, Message, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
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
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
// Add this constant at the top of the file
const MAX_CONTENT_LENGTH = 30000; // Adjust as needed

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
  const [minLength, setMinLength] = useState(100);
  const [maxLength, setMaxLength] = useState(10000);

  // Chat state
  const [isChatEnabled, setIsChatEnabled] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<Message>>([]);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);

  const [floatingInput, setFloatingInput] = useState("");
  const [isFloatingInputVisible, setIsFloatingInputVisible] = useState(false);

  const floatingInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    const container = componentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollPercentage =
        (scrollTop / (scrollHeight - clientHeight)) * 100;
      const shouldShow = scrollPercentage < 90; // Show when scrolled up more than 10%

      setShowScrollButton(shouldShow);
    };

    container.addEventListener("scroll", handleScroll);

    // Trigger initial check
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = () => {
    const container = componentRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };
  // Add this function to calculate total content length
  const calculateTotalContentLength = (results: ContentItem[]): number => {
    return results.reduce((total, item) => {
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

  const handleFloatingInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floatingInput.trim()) return;

    const totalContentLength = calculateTotalContentLength(results);
    if (totalContentLength > MAX_CONTENT_LENGTH) {
      toast({
        title: "Content too large",
        description: `The total content length (${totalContentLength} characters) exceeds the maximum allowed (${MAX_CONTENT_LENGTH} characters). Please refine your search to reduce the amount of content.`,
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

      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant.
            The user is using a product called "screenpipe" which records
            his screen and mics 24/7. The user ask you questions
            and you use his screenpipe recordings to answer him.

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
            
            Based on the following search results:
            ${JSON.stringify(results)}
            `,
        },
        ...chatMessages.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: userMessage.content,
        },
      ];

      const stream = await openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
      });

      let fullResponse = "";
      // @ts-ignore
      setChatMessages((prevMessages) => [
        ...prevMessages,
        { role: "assistant", content: "" },
      ]);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        // @ts-ignore
        setChatMessages((prevMessages) => [
          ...prevMessages.slice(0, -1),
          { role: "assistant", content: fullResponse },
        ]);
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      toast({
        title: "Error",
        description: "Failed to generate AI response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
      setIsFloatingInputVisible(false);
    }
  };

  const handleSearch = async (newOffset = 0) => {
    posthog.capture("search");
    setIsLoading(true);
    setOffset(newOffset);
    setProgress(0);
    let allFilteredResults: ContentItem[] = [];
    let currentOffset = newOffset;
    let totalUnfilteredResults = 0;

    while (allFilteredResults.length < limit) {
      const response = await queryScreenpipe({
        q: query || undefined,
        content_type: contentType as "all" | "ocr" | "audio",
        limit,
        offset: currentOffset,
        start_time: startDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
        end_time: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
        app_name: appName || undefined,
        window_name: windowName || undefined,
        include_frames: includeFrames,
      });

      if (response && response.data.length > 0) {
        console.log("response", response);
        const filteredResults = response.data.filter((item) => {
          const contentLength =
            item.type === "OCR"
              ? item.content.text.length
              : item.type === "Audio"
              ? item.content.transcription.length
              : item.type === "FTS"
              ? item.content.matched_text.length
              : 0;
          return contentLength >= minLength && contentLength <= maxLength;
        });
        allFilteredResults = [...allFilteredResults, ...filteredResults];
        // Update progress based on fetched results
        const currentProgress = Math.min(
          (allFilteredResults.length / limit) * 100,
          100
        );
        setProgress(currentProgress);

        currentOffset += response.data.length;
        totalUnfilteredResults = response.pagination.total;
      } else {
        break; // No more results to fetch
      }

      if (currentOffset >= totalUnfilteredResults) {
        break; // We've fetched all available results
      }
    }

    setResults(allFilteredResults.slice(0, limit));
    setTotalResults(allFilteredResults.length);
    setIsChatEnabled(true);
    setIsLoading(false);
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

    if (results.length === 0) {
      return <p className="text-center">No results found</p>;
    }

    return results.map((item, index) => (
      <Card key={index}>
        <CardContent className="p-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value={`item-${index}`}>
              <AccordionTrigger className="flex items-center">
                <div className="flex items-center w-full">
                  <Badge className="mr-2">{item.type}</Badge>
                </div>
                <span className="flex-grow text-center truncate">
                  {item.type === "OCR" && item.content.text.substring(0, 50)}
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
                    <VideoComponent filePath={item.content.file_path} />
                    {includeFrames && item.content.frame && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <img
                            src={`data:image/jpeg;base64,${item.content.frame}`}
                            alt="Frame"
                            className="mt-2 w-24 h-auto cursor-pointer"
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
                    )}
                  </>
                )}
                {item.type === "Audio" && (
                  <>
                    <p className="mt-2">{item.content.transcription}</p>
                    <VideoComponent filePath={item.content.file_path} />
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
              {new Date(item.content.timestamp).toLocaleString()}
            </p>
            {item.type === "OCR" && item.content.app_name && (
              <Badge className="text-xs">{item.content.app_name}</Badge>
            )}
            {item.type === "FTS" && item.content.window_name && (
              <Badge className="text-xs">{item.content.window_name}</Badge>
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
    ));
  };

  return (
    <div
      ref={componentRef}
      className="space-y-4 w-full max-w-4xl relative overflow-y-auto max-h-[calc(100vh-100px)]"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="search-query">Search Query</Label>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="search-query"
              type="text"
              placeholder="Search your data..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoCorrect="off"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="content-type">Content Type</Label>
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger id="content-type" className="relative">
              <Layers
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <SelectValue placeholder="Content Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="pl-6">All</span>
              </SelectItem>
              <SelectItem value="ocr">
                <span className="pl-6">OCR</span>
              </SelectItem>
              <SelectItem value="audio">
                <span className="pl-6">Audio</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="start-date">Start Date</Label>
          <div className="relative">
            <DateTimePicker
              date={startDate}
              setDate={setStartDate}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End Date</Label>
          <div className="relative">
            <DateTimePicker
              date={endDate}
              setDate={setEndDate}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-name">App Name</Label>
          <div className="relative">
            <Laptop
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="app-name"
              type="text"
              placeholder="App Name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              autoCorrect="off"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="window-name">Window Name</Label>
          <div className="relative">
            <Layout
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="window-name"
              type="text"
              placeholder="Window Name"
              value={windowName}
              onChange={(e) => setWindowName(e.target.value)}
              autoCorrect="off"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="include-frames"
            checked={includeFrames}
            onCheckedChange={setIncludeFrames}
          />
          <Label htmlFor="include-frames">Include Frames</Label>
        </div>
        <div className="flex flex-col space-y-2">
          <Label htmlFor="limit-slider">Limit: {limit}</Label>
          <Slider
            id="limit-slider"
            value={[limit]}
            onValueChange={(value: number[]) => setLimit(value[0])}
            min={1}
            max={100}
            step={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="min-length">Min Length</Label>
          <div className="relative">
            <AlignLeft
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="min-length"
              type="number"
              placeholder="Min Length"
              value={minLength}
              onChange={(e) => setMinLength(Number(e.target.value))}
              min={0}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-length">Max Length</Label>
          <div className="relative">
            <AlignLeft
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <Input
              id="max-length"
              type="number"
              placeholder="Max Length"
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              min={0}
              className="pl-8"
            />
          </div>
        </div>
      </div>
      <Button
        onClick={() => handleSearch(0)}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Searching... {progress.toFixed(0)}%
          </>
        ) : (
          "Search"
        )}
      </Button>
      {isLoading && (
        <div className="mt-2">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-gray-500 mt-1 text-center">
            Fetched {results.length} results
          </p>
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
              <Input
                ref={floatingInputRef}
                type="text"
                placeholder="Ask a question about the results..."
                value={floatingInput}
                onChange={(e) => setFloatingInput(e.target.value)}
                className="w-full h-16 focus:outline-none focus:ring-0 border-0 focus:border-black focus:border transition-all duration-200"
              />
              <Button
                type="submit"
                className="mb-2 w-12"
                disabled={
                  isAiLoading ||
                  calculateTotalContentLength(results) > MAX_CONTENT_LENGTH
                }
              >
                <Send className="h-4 w-4" />
                {calculateTotalContentLength(results) > MAX_CONTENT_LENGTH && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertCircle className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Content too long!</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Display chat messages */}
      <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto overflow-y-auto max-h-[600px]">
        {chatMessages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
        {isAiLoading && spinner}
      </div>
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-8 bg-white rounded-full p-2 shadow-md hover:bg-gray-100 transition-colors duration-200"
        >
          <ChevronDown size={24} />
        </button>
      )}
      <div className="h-24" />
    </div>
  );
}
