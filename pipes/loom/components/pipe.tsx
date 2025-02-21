import { Clock, Loader2 } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { Badge } from "@/components/ui/badge";
import { LLMChat } from "@/components/llm-chat";
import { Button } from '@/components/ui/button';
import { pipe, ContentItem } from "@screenpipe/browser"
import React, { useState} from 'react';
import { DateTimePicker } from './date-time-picker';
import { VideoComponent } from "@/components/video-comp";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { useAiProvider } from "@/lib/hooks/use-ai-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/lib/hooks/use-settings";

const Pipe: React.FC = () => {
  const { toast } = useToast();
  const [rawData, setRawData] = useState<any[] | undefined>([]);
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('');
  const { isServerDown } = useHealthCheck()
  const { settings} = useSettings();
  const aiDisabled =
    settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;
  const { isAvailable, error } = useAiProvider(settings);

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

  const handleContentMerging = async (type: 'ocr' | 'audio') => {
    try {
      setIsMerging(true);
      toast({
        title: "merging",
        description: "video merging in process...",
        duration: 3000,
      });
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();

      try {
        const response = await pipe.queryScreenpipe({
          offset: 0,
          limit: 10000000, // limit is fucking annoying
          contentType: type,
          startTime: startTimeStr,
          endTime: endTimeStr,
        })
        const filePaths = response?.data.map((item: ContentItem) => item.content.filePath);
        const uniqueFilePaths = [...new Set(filePaths)];
        setRawData(response?.data);
        if (uniqueFilePaths.length < 2) {
          toast({
            title: "insufficient content",
            variant: "default",
            description: "insufficient media contents in that time period, please try again!",
          });
          setIsMerging(false);
          return;
        }
        await mergeContent(uniqueFilePaths, 'video');
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
      console.error('error merging videos:', error);
      toast({
        title: "error",
        variant: "destructive",
        description: "error in media merging, please try again later!!",
      });
      setIsMerging(false);
    }
  };

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
                onClick={() => handleContentMerging('ocr')}
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
          {(aiDisabled || isServerDown || isAvailable) && (
            <TooltipContent>
              <p>{`${
                  (aiDisabled && isServerDown) || isAvailable
                    ? "you don't have access of screenpipe-cloud and screenpipe is down!"
                    : isServerDown
                    ? "screenpipe is not running..."
                    : aiDisabled
                    ? "you don't have access to screenpipe-cloud :( please consider login"
                    : isAvailable
                    ? { error }
                    : ""
                }
              `}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {mergedVideoPath && (
        <div className="border-2 mt-16 w-[1400px] rounded-lg flex-col flex items-center justify-center" >
          <VideoComponent
            filePath={mergedVideoPath}
            className="text-center m-8 "
          />
          <LLMChat data={rawData} />
        </div>
      )}
    </div>
  );
};

export default Pipe;

