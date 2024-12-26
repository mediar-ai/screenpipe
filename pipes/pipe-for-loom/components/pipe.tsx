import { Clock } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import React, { useEffect, useState} from 'react';
import { DateTimePicker } from './date-time-picker';
import { VideoComponent } from "@/components/video-comp";
import VideoTimelineBlock from "@/components/video-timeline";
import { LLMChat } from "@/components/llm-chat";

const Pipe: React.FC = () => {
  const { toast } = useToast();
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('');
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [audioBlobUrl, setAudioBlobUrl] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);

  useEffect(() => {
    const createBlobUrl = async (path: string) => {
      try {
        const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error(`failed to fetch: ${response.statusText}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (type === 'video') {
          setVideoBlobUrl(url);
          setAudioBlobUrl('');
        } else {
          setAudioBlobUrl(url);
          setVideoBlobUrl('');
        }
      } catch (error) {
        console.error('error creating blob URL:', error);
      }
    };
    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [mergedVideoPath, audioBlobUrl, videoBlobUrl]);

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

  const fetchVideoContent = async (startTime: string, endTime: string) => {
    try {
      const limit = await getMaxLimit()
      console.log("Limit:", limit)
      const response = await fetch(`http://localhost:3030/search?q=&limit=${limit}&offset=0&content_type=ocr&start_time=${startTime}&end_time=${endTime}&min_length=50&max_length=200`);
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data = await response.json();
      const filePaths = data.data.map((item: any) => item.content.file_path);
      const uniqueFilePaths = [...new Set(filePaths)];
      return uniqueFilePaths;
    } catch (e :any) {
      toast({
        title: "error",
        variant: "destructive",
        description: `failed to get video: ${e.message}`,
        duration: 3000,
      });
      return;
    }
  };

  const fetchAudioContent = async (startTime: string, endTime: string) => {
    try{
      const limit = await getMaxLimit()
      const response = await fetch(`http://localhost:3030/search?q=&limit=${limit}&offset=0&content_type=audio&start_time=${startTime}&end_time=${endTime}&min_length=50&max_length=200`);
      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }
      const data = await response.json();
      const filePaths = data.data.map((item: any) => item.content.file_path);
      const uniqueFilePaths = [...new Set(filePaths)];
      return uniqueFilePaths;
    } catch(e :any) {
      toast({
        title: "error",
        variant: "destructive",
        description: `failed to get video: ${e.message}`,
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
        console.log("merged video path", mergedVideoPath)
      }       
    console.log("data", data)
    } catch(error) {
      toast({
        title: "error",
        variant: "destructive",
        description: "ffmpge error, please report it on screenpipe's github!",
        duration: 3000,
      });
    }
  };

  const handleVideoMerging = async () => {
    try {
      setIsMerging(true);
      toast({
        title: "merging",
        description: "video merging in process...",
        duration: 3000,
      });
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();

      const videoPaths = await fetchVideoContent(startTimeStr, endTimeStr) as string[];
      console.log("videoPaths", videoPaths)
      if (videoPaths.length < 2) {
        toast({
          title: "insufficient content",
          variant: "destructive",
          description: "insufficient video contents in that time period, please try again later!",
          duration: 3000,
        });
        setIsMerging(false);
        return;
      }
      await mergeContent(videoPaths, 'video');
    } catch (error :any) {
      console.error('error merging videos:', error);
      toast({
        title: "error",
        variant: "destructive",
        description: "error in video merging, please try again later!!",
        duration: 3000,
      });
      setIsMerging(false);
    }
  };

  const data =  [
    {
      "type": "OCR",
      "content": {
        "frame_id": 3292,
        "text": "New Tab c mediar-ai/screenpipe 5] Q Search or enter address [bounty] allow user to O [bug] Connection lost.... O Mac mini - Education N luckasRanarison/tailwi... mistweaverco/kulala.n... nvim-lspconfig/doc/c... chatgpt Which Villain Has The ??? Phind I Ranked Oscar Nomin... Search or enter address AliExpress Sponsored @google github youtube The Indian Express Firefox web.whatsapp e,_ 3 S ??k??Iained console.algora Thought-provoking stories MIT Technology Review Fast Company",
        "timestamp": "2024-12-25T07:08:27.626220100Z",
        "file_path": "C:\\Users\\eirae\\.screenpipe\\data\\monitor_65537_2024-12-25_07-08-27.mp4",
        "offset_index": 6,
        "app_name": "Firefox",
        "window_name": "Mozilla Firefox",
        "tags": [],
        "frame": null
      }
    },
    {
      "type": "OCR",
      "content": {
        "frame_id": 3290,
        "text": "x Restore pages Microsoft Edge closed while you had some pages open. Resto re",
        "timestamp": "2024-12-25T07:08:27.603156600Z",
        "file_path": "C:\\Users\\eirae\\.screenpipe\\data\\monitor_65537_2024-12-25_07-08-27.mp4",
        "offset_index": 4,
        "app_name": "Microsoft Edge",
        "window_name": "Restore pages",
        "tags": [],
        "frame": null
      }
    }
  ]

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
        onClick={handleVideoMerging}
        disabled={isMerging}
      >
        generate loom video
      </Button>

      <div className="border-2 mt-16 w-[1400px] rounded-lg flex-col flex items-center justify-center" >
        <VideoComponent
          filePath={"C:\\Users\\eirae\\.screenpipe\\data\\monitor_65537_2024-12-24_12-00-40.mp4"}
          className="text-center m-8 "
        />
        <LLMChat data={data} />
      </div>
      {/* <VideoTimelineBlock  */}
      {/*   timelineVideosPath={ */} {/*   } */}
      {/* /> */}
    </div>
  );
};

export default Pipe;

