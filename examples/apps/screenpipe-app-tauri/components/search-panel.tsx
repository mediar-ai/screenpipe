import React, { useState } from "react";
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
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VideoComponent } from "./video";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { DateTimePicker } from "./date-time-picker";
import { IconCode } from "./ui/icons";
import { CodeBlock } from "./ui/codeblock";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { useToast } from "./ui/use-toast";
import { Badge } from "./ui/badge";
import posthog from "posthog-js";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() - 24 * 3600000)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [includeFrames, setIncludeFrames] = useState(false);
  const [limit, setLimit] = useState(50);
  const [appName, setAppName] = useState("");
  const [windowName, setWindowName] = useState("");
  const [contentType, setContentType] = useState("all");
  const [offset, setOffset] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const generateCurlCommand = () => {
    const baseUrl = "http://localhost:3030";
    const queryParams = new URLSearchParams({
      content_type: contentType,
      limit: limit.toString(),
      offset: offset.toString(),
      start_time: startDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
      end_time: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
    });

    if (query) queryParams.append("q", query);
    if (appName) queryParams.append("app_name", appName);
    if (windowName) queryParams.append("window_name", windowName);
    if (includeFrames) queryParams.append("include_frames", "true");

    return `curl "${baseUrl}/search?\\
${queryParams.toString().replace(/&/g, "\\\n&")}" | jq`;
  };
  const handleSearch = async (newOffset = 0) => {
    posthog.capture("search");
    setIsLoading(true);
    setOffset(newOffset);
    const response = await queryScreenpipe({
      q: query || undefined,
      content_type: contentType as "all" | "ocr" | "audio",
      limit,
      offset: newOffset,
      start_time: startDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
      end_time: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
      app_name: appName || undefined,
      window_name: windowName || undefined,
      include_frames: includeFrames,
    });
    if (response) {
      console.log("response", response);
      setResults(response.data);
      setTotalResults(response.pagination.total);
    }
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
  const handleBadgeClick = (type: "app" | "window", value: string) => {
    if (type === "app") {
      setAppName(value);
    } else if (type === "window") {
      setWindowName(value);
    }
  };
  const renderContent = (item: ContentItem) => {
    const copyContent = () => {
      let textToCopy = "";
      switch (item.type) {
        case "OCR":
          textToCopy = item.content.text;
          break;
        case "Audio":
          textToCopy = item.content.transcription;
          break;
        case "FTS":
          textToCopy = item.content.matched_text;
          break;
      }
      copyToClipboard(textToCopy);
      toast({
        title: "Copied to clipboard",
        description: "The content has been copied to your clipboard.",
      });
    };

    return (
      <div className="py-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={copyContent} variant="outline" size="sm">
                Copy
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy content to clipboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="flex  items-center">
              <div className="flex items-center  w-full">
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
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          type="text"
          placeholder="Search your data..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCorrect="off"
        />
        <Select value={contentType} onValueChange={setContentType}>
          <SelectTrigger>
            <SelectValue placeholder="Content Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="ocr">OCR</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
          </SelectContent>
        </Select>
        <DateTimePicker date={startDate} setDate={setStartDate} />
        <DateTimePicker date={endDate} setDate={setEndDate} />
        <Input
          type="text"
          placeholder="App Name"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          autoCorrect="off"
        />
        <Input
          type="text"
          placeholder="Window Name"
          value={windowName}
          onChange={(e) => setWindowName(e.target.value)}
          autoCorrect="off"
        />
        <div className="flex items-center space-x-2">
          <Switch
            id="include-frames"
            checked={includeFrames}
            onCheckedChange={setIncludeFrames}
          />
          <Label htmlFor="include-frames">Include Frames</Label>
        </div>
        <div className="flex flex-col space-y-2">
          <Label>Limit: {limit}</Label>
          <Slider
            value={[limit]}
            onValueChange={(value: number[]) => setLimit(value[0])}
            min={1}
            max={100}
            step={1}
          />
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => handleSearch(0)}
          disabled={isLoading}
          className="flex-grow items-center"
        >
          {isLoading ? "Searching..." : "Search"}
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <IconCode className="m-2" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>cURL Command</DialogTitle>
            </DialogHeader>
            <CodeBlock language="bash" value={generateCurlCommand()} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading && <Progress value={33} className="w-full" />}
      <div className="space-y-4">
        {isLoading ? (
          Array(3)
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
            ))
        ) : results.length > 0 ? (
          results.map((item, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{item.type}</p>
                {renderContent(item)}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className="text-xs text-gray-400">
                    {new Date(item.content.timestamp).toLocaleString()}
                  </p>
                  {/* @ts-ignore */}
                  {item.content.app_name && (
                    <Badge
                      className="text-xs"
                      onClick={() =>
                        // @ts-ignore
                        handleBadgeClick("app", item.content.app_name)
                      }
                    >
                      {/* @ts-ignore */}
                      {item.content.app_name}
                    </Badge>
                  )}
                  {/* @ts-ignore */}
                  {item.content.window_name && (
                    <Badge
                      className="text-xs"
                      onClick={() =>
                        // @ts-ignore
                        handleBadgeClick("window", item.content.window_name)
                      }
                    >
                      {/* @ts-ignore */}
                      {item.content.window_name}
                    </Badge>
                  )}
                  {item.content.tags &&
                    item.content.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        className="text-xs"
                        // onClick={() => handleBadgeClick("tag", tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <p>No results found</p>
        )}
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
    </div>
  );
}
