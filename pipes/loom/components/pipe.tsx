"use client"
import { Clock, Loader2, Volume2 } from "lucide-react";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { useToast } from "@/lib/use-toast";
import { Badge } from "@/components/ui/badge";
import { LLMChat } from "@/components/llm-chat";
import { Button } from '@/components/ui/button';
import { pipe, ContentItem } from "@screenpipe/browser"
import React, { useState, useEffect} from 'react';
import { DateTimePicker } from './date-time-picker';
import { MediaComponent } from "@/components/media-comp";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { useAiProvider } from "@/lib/hooks/use-ai-provider";
import { OCRContent, AudioContent, ContentType, ScreenpipeQueryParams } from "@screenpipe/browser";
import { cn } from "@/lib/utils";
import { loadHistory } from "@/lib/actions/history";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/lib/hooks/use-settings";

const Divider = () => (
  <div className="flex my-2 justify-center">
    <div className="h-[1px] w-[400px] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
    <div className="h-[1px] w-[400px] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
  </div>
);

function isOCRContent(item: ContentItem): item is { type: "OCR"; content: OCRContent } {
  return item.type === "OCR";
}

function isAudioContent(item: ContentItem): item is { type: "Audio"; content: AudioContent } {
  return item.type === "Audio";
}

const Pipe: React.FC = () => {
  const { toast } = useToast();
  const { settings} = useSettings();
  const { isServerDown } = useHealthCheck()
  const { isAvailable, error } = useAiProvider(settings);
  const [key, setKey] = useState(0);
  const [rawData, setRawData] = useState<ContentItem[] | undefined>([]);
  const [queryParams, setQueryParams] = useState<ScreenpipeQueryParams | undefined>();
  const [isCopied, setIsCopied] = React.useState<Boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('');
  const [mergedAudioPath, setMergedAudioPath] = useState<string>('');
  const [ocrContents, setOcrContents] = useState<OCRContent[] | undefined>([]);
  const [audioContents, setAudioContents] = useState<AudioContent[] | undefined>([]);

  const aiDisabled =
    settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;

  const handleQuickTimeFilter = (minutes: number) => {
    const now = new Date();
    const newStartTime = new Date(now.getTime() - minutes * 60000);
    setStartTime(newStartTime);
    setEndTime(now);
  };
  
  const mergeContent = async (contents: string[], type: 'video' | 'audio') => {
    const mergeContentPaths = [...new Set([...contents])];
    const mergePayload = { 
      video_paths: mergeContentPaths,
    };

    try {
      const response = await fetch(`http://localhost:3030/experimental/frames/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergePayload),
      });
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data = await response.json();
      if (type === 'video') {
        setMergedVideoPath(data.video_path);
        setMergedAudioPath('');
        setIsMerging(false);
      } else if (type === 'audio') {
        setMergedAudioPath(data.video_path);
        setMergedVideoPath('');
        setIsMerging(false);
      }
    } catch(error) {
      toast({
        title: "error",
        variant: "destructive",
        description: "ffmpge error, please report it on screenpipe's github!",
        duration: 3000,
      });
    }
  };

  const handleContentMerging = async () => {
    localStorage.removeItem('historyId');
    try {
      setIsMerging(true);
      toast({
        title: "merging",
        description: "video media in process...",
        duration: 3000,
      });
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();

      try {
        let contentType: ContentType | undefined = undefined
        if (settings.customSettings?.loom?.contentType === "audio"){
          contentType = "audio";
        } else {
          contentType = "audio+ocr"
        }
        const response = await pipe.queryScreenpipe({
          offset: 0,
          limit: 100000, // keep max
          contentType: contentType,
          startTime: startTimeStr,
          endTime: endTimeStr,
          maxLength: settings.customSettings?.loom?.maxLength || 500,
          minLength: 50,
        })

        if (response?.data) {
          setQueryParams({
            offset: 0,
            limit: 100000,
            contentType: contentType,
            startTime: startTimeStr,
            endTime: endTimeStr,
            maxLength: settings.customSettings?.loom?.maxLength || 500,
            minLength: 50,
          })
          setRawData(response.data);

          const ocrContents = response.data
            .filter(isOCRContent)
            .map((item) => item.content);

          const audioContents = response.data
            .filter(isAudioContent)
            .map((item) => item.content);

          setOcrContents(ocrContents);
          setAudioContents(audioContents);
        }
        
        let mediaFiles: string[] | undefined = [];
        if (settings.customSettings?.loom?.contentType === "audio") {
          mediaFiles = audioContents?.map((i) => i.filePath);
        } else {
          mediaFiles = ocrContents?.map((i) => i.filePath);
        }
        const uniqueMediaFiles = [...new Set(mediaFiles)];
        if (uniqueMediaFiles.length <= 1) {
          toast({
            title: "insufficient content",
            variant: "default",
            description: "no media contents found in that time period, please try again!",
          });
          setIsMerging(false);
          return;
        }
        let mergeType: "audio" | "video" = "video";
        if (settings.customSettings?.loom?.contentType === "audio"){
          mergeType = "audio";
        } else {
          mergeType = "video";
        }
        await mergeContent(uniqueMediaFiles.reverse(), mergeType);
        setIsMerging(false);
      } catch (e :any) {
        toast({
          title: "error",
          variant: "destructive",
          description: `failed to fetch media: ${e.message}`,
          duration: 3000,
        });
      }
    } catch (error :any) {
      console.error('error merging media:', error);
      toast({
        title: "error",
        variant: "destructive",
        description: "error in media merging, please try again later!!",
      });
      setIsMerging(false);
    }
  };

  const copyMediaToClipboard = async () => {
    if (mergedVideoPath) {
      try {
        setIsCopied(false);
        const response = await fetch(`/api/copy?path=${encodeURIComponent(mergedVideoPath)}`);
        const result = await response.json();
        if (!response.ok) {
          setIsCopied(false);
          throw new Error(result.error || "Failed to copy video to clipboard");
        }
        toast({
          title: "media copied to your clipboard",
          variant: "default",
          duration: 3000,
        });
        setIsCopied(true);
        setTimeout(() => {
          setIsCopied(false);
        }, 3000);
      } catch (err) {
        console.error("failed to copy media: ", err);
        setIsCopied(true);
        toast({
          title: "failed to copy media to clipboard",
          variant: "default",
          duration: 3000,
        });
      }
    }
  };

  useEffect(() => {
    setKey(prevKey => prevKey + 1);
    localStorage.removeItem('historyId');
  }, [mergedVideoPath, mergedAudioPath]);

  const setHistory = async () => {
    const historyId = localStorage.getItem("historyId");
    if (historyId) {
      const history = await loadHistory(historyId);
      const historyItem = history[0];
      if (historyItem) {
        setStartTime(historyItem.params?.startTime
          ? new Date(historyItem.params.startTime)
          : new Date());
        setEndTime(historyItem.params?.endTime 
          ? new Date(historyItem.params.endTime)
          : new Date());
        setMergedVideoPath(historyItem.mergedVideoPath);
        setMergedAudioPath(historyItem.mergedAudioPath);
        setOcrContents(historyItem.ocrContents)
        setAudioContents(historyItem.audioContents)
      }
    }
  };

  useEffect(() => {
    const handleChatUpdate = () => {
      setHistory();
    };
    window.addEventListener("historyUpdated", handleChatUpdate);
    setHistory();
    return () => {
      window.removeEventListener("historyUpdated", handleChatUpdate);
    };
  }, []);


  return (
    <div className="w-full mt-4 flex flex-col justify-center items-center">
      <h1 className='font-medium text-xl'>
        get contextual loom of your spent time
      </h1>
      <div className="h-fit min-w-[550px] flex flex-row justify-between mt-10">
        <div>
          <h2 className="text-[15px]">start time:</h2>
          <DateTimePicker date={startTime} setDate={setStartTime} />
        </div>
        <div>
          <h2 className="text-[15px]">end time:</h2>
          <DateTimePicker date={endTime} setDate={setEndTime} />
        </div>
      </div>

      <div className="flex mt-8 space-x-2 justify-center">
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
          onClick={() => handleQuickTimeFilter(12 * 60)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 12h
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
          onClick={() => handleQuickTimeFilter(24 * 60 * 7)}
        >
          <Clock className="mr-2 h-4 w-4" />
          last 7 days
        </Badge>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="mt-10" asChild>
            <span>
              <Button 
                onClick={() => handleContentMerging()}
                disabled={isMerging || isServerDown}
                className="disabled:!cursor-not-allowed min-w-40 shadow-lg text-md"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    generating loom...
                  </>
                ) : (
                    "generate loom"
                  )}
              </Button>
            </span>
          </TooltipTrigger>
          {(isServerDown || !isAvailable) && (
            <TooltipContent>
              <p>{`${
                  (!isAvailable && isServerDown)
                    ? `screenpipe is down, ${error}`
                    : isServerDown
                    ? "screenpipe is not running..."
                    : !isAvailable 
                    ? `${error}`
                    : !aiDisabled 
                    ? "you don't have access to screenpipe-cloud :( please consider login"
                    : ""
                }
              `}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {(mergedVideoPath || mergedAudioPath) && (
        <div className="border-2 mt-16 pt-10 w-[1200px] relative rounded-lg flex-col flex items-center justify-center" >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild className="cursor-pointer">
                <Button
                  variant={"outline"} 
                  size={"icon"}
                  onClick={copyMediaToClipboard}
                  className="mt-4 absolute !border-none right-5 top-5"
                >
                  {isCopied ? <IconCheck /> : <IconCopy />}
                  <span className="sr-only">Copy media</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                copy this media to <br/> system clipboard
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <MediaComponent
            filePath={mergedVideoPath ? mergedVideoPath : mergedAudioPath}
            type={mergedAudioPath ? "audio" : "video"}
            className="text-center m-8 "
          />
        {mergedVideoPath && (
          <div className="mt-4 w-[80%]">
            <div className={cn("flex relative flex-row items-center justify-center w-full")}>
              {audioContents?.length !== 0 && (
                audioContents?.map((file, index) => {
                const audioTime = new Date(file.timestamp).getTime();
                const startTimeMs = startTime.getTime();
                const endTimeMs = endTime.getTime();
                const position = ((audioTime - startTimeMs) / (endTimeMs - startTimeMs)) * 100;
                return (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger asChild className="cursor-pointer">
                        <Volume2
                          className="absolute w-4 h-4"
                          style={{ left: `${position}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <MediaComponent
                          filePath={file.filePath} 
                          className="text-center m-8"
                        />
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }))}
            </div>
            {audioContents?.length !== 0 && (
              <div className="grid-flow-col h-[50px] grid gap-[2px] border rounded-md mt-4 border-slate-800/30">
                {Array.from({ length: 200 }).map((_, index) => (
                  <div key={index} className="bg-slate-900/30 h-full rounded-md"></div>
                ))}
              </div>
            )}
          </div>
        )}
          <Divider />
          <LLMChat 
            key={key}
            data={rawData}
            mergedVideoPath={mergedVideoPath}
            mergedAudioPath={mergedAudioPath}
            params={queryParams}
          />
        </div>
      )}
    </div>
  );
};

export default Pipe;

