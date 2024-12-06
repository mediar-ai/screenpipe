import { Button } from '@/components/ui/button';
import React, { useEffect, useState} from 'react';
import { DateTimePicker } from './date-time-picker';
import { useToast } from "@/lib/use-toast";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const Pipe: React.FC = () => {
  const { toast } = useToast();
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('');
  const [mergedAudioPath, setMergedAudioPath] = useState<string>('');
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [audioBlobUrl, setAudioBlobUrl] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [activeContentType, setActiveContentType] = useState<'video' | 'audio' | null>(null);

  useEffect(() => {
    const createBlobUrl = async (path: string, type: 'video' | 'audio') => {
      try {
        console.log(`fetching blob url for path: ${path}`);
        const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        console.log(`res status: ${response.status}`);
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
    
    if (mergedVideoPath) {
      createBlobUrl(mergedVideoPath, 'video');
    }

    if (mergedAudioPath) {
      createBlobUrl(mergedAudioPath, 'audio');
    }

    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, [mergedVideoPath, mergedAudioPath]);

  useEffect(() =>{
    if (videoBlobUrl || audioBlobUrl) {
      setIsDialogOpen(true);
    }
  }, [videoBlobUrl, audioBlobUrl])

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
      } else {
        setMergedAudioPath(data.video_path);
        console.log("merged audio path", mergedAudioPath)
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
      setActiveContentType('video');
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

  const handleAudioMerging = async () => {
    try {
      setIsMerging(true);
      setActiveContentType('audio');
      toast({
        title: "merging",
        description: "audio merging in process...",
        duration: 3000,
      });
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();

      const audioPaths = await fetchAudioContent(startTimeStr, endTimeStr) as string[];
      console.log("audioPaths", audioPaths)
      if (audioPaths.length < 2) {
        toast({
          title: "insufficient content",
          variant: "destructive",
          description: "insufficient audio contents, please try again later",
          duration: 3000,
        });
        setIsMerging(false);
        return;
      }
      await mergeContent(audioPaths, 'audio');
    } catch (error :any) {
      console.error('error merging audios:', error);
      toast({
        title: "error",
        variant: "destructive",
        description: "error in audio merging, please try again!",
        duration: 3000,
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

      <div className="flex mt-12 flex-row min-w-[550px] justify-between items-center">
        <Button 
          className="!w-32 disabled:!cursor-not-allowed"
          variant={"default"}
          onClick={handleVideoMerging}
          disabled={isMerging}
        >
          get video loom
        </Button>
        <Button 
          className="!w-32 disabled:!cursor-not-allowed"
          variant={"default"}
          onClick={handleAudioMerging}
          disabled={isMerging}
        >
          get audio loom
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if(!open){
          setIsMerging(false);
        }
      }}>
        <DialogContent className='flex flex-col justify-center items-center max-w-[80rem] h-[650px] '>
          <DialogHeader className="flex flex-col justify-center items-center">
            <DialogTitle className="text-center text-2xl">
              loom for your spent time
            </DialogTitle>
          </DialogHeader>
          {activeContentType === 'video' && videoBlobUrl && (
            <video controls className="w-[70%] rounded-md">
              <source src={videoBlobUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          )}
          {activeContentType === 'audio' && audioBlobUrl && (
            <div className="bg-gray-100 p-4 rounded-md">
              <audio controls className="w-full">
                <source src={audioBlobUrl} type="video/mp4" />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </DialogContent>
        <DialogFooter />
      </Dialog>
    </div>
  );
};

export default Pipe;

