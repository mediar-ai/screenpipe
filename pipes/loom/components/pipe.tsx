import { Clock } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { Badge } from "@/components/ui/badge";
import { LLMChat } from "@/components/llm-chat";
import { Button } from '@/components/ui/button';
import React, { useEffect, useState} from 'react';
import { DateTimePicker } from './date-time-picker';
import { VideoComponent } from "@/components/video-comp";

const Pipe: React.FC = () => {
  const { toast } = useToast();
  const [rawData, setRawData] = useState<any[]>([]);
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('');

  const handleQuickTimeFilter = (minutes: number) => {
    const now = new Date();
    const newStartTime = new Date(now.getTime() - minutes * 60000);
    setStartTime(newStartTime);
    setEndTime(now);
  };
  
  const getMaxLimit = async () => {
    try {
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();
      const response = await fetch(`http://localhost:3030/search?content_type=all&limit=30&offset=0&start_time=${startTimeStr}&end_time=${endTimeStr}&min_length=50&max_length=10000`)
      console.log(`http://localhost:3030/search?content_type=all&limit=30&offset=0&start_time=${startTimeStr}&end_time=${endTimeStr}&min_length=50&max_length=10000`)
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.pagination.total;
    } catch (error: any) {
      toast({
        title: "error",
        variant: "destructive",
        description: `something went wrong: ${error.message}`,
        duration: 3000,
      });
      return;
    }
  } 

  const fetchContent = async (startTime: string, endTime: string, contentType: 'ocr' | 'audio' | 'all' | 'ui') => {
    try {
      const limit = await getMaxLimit()
      const response = await fetch(`http://localhost:3030/search?q=&limit=${limit}&offset=0&content_type=${contentType}&start_time=${startTime}&end_time=${endTime}&min_length=50&max_length=200`);
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data = await response.json();
      const filePaths = data.data.map((item: any) => item.content.file_path);
      const uniqueFilePaths = [...new Set(filePaths)];
      setRawData(data.data);
      return uniqueFilePaths;
    } catch (e :any) {
      toast({
        title: "error",
        variant: "destructive",
        description: `failed to fetch media: ${e.message}`,
        duration: 3000,
      });
      return;
    }
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

      const videoPaths = await fetchContent(startTimeStr, endTimeStr, type) as string[];
      console.log("Video Paths", videoPaths)
      if (videoPaths.length < 2) {
        toast({
          title: "insufficient content",
          variant: "destructive",
          description: "insufficient media contents in that time period, please try again!",
          duration: 3000,
        });
        setIsMerging(false);
        return;
      }
      await mergeContent(videoPaths, 'video');
      setIsMerging(false);
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
        get loom of your spent time
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
      </div>

      <Button 
        className="mt-10 disabled:!cursor-not-allowed"
        variant={"default"}
        onClick={() => handleContentMerging('ocr')}
        disabled={isMerging}
      >
        generate loom
      </Button>
      
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

