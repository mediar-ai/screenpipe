import { useState, useEffect, useRef } from "react";
import { AudioData, StreamTimeSeriesResponse } from "@/app/timeline/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, Volume2, GripHorizontal, X } from "lucide-react";
import { VideoComponent } from "@/components/video";

interface AudioGroup {
  deviceName: string;
  isInput: boolean;
  audioItems: AudioData[];
  startTime: Date;
  endTime: Date;
}

interface AudioTranscriptProps {
  frames: StreamTimeSeriesResponse[];
  currentIndex: number;
  groupingWindowMs?: number; // how many ms to group audio files together
  onClose?: () => void;
}

export function AudioTranscript({
  frames,
  currentIndex,
  groupingWindowMs = 30000,
  onClose,
}: AudioTranscriptProps) {
  const [audioGroups, setAudioGroups] = useState<AudioGroup[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [position, setPosition] = useState({
    x: window.innerWidth - 320,
    y: 100,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [windowSize, setWindowSize] = useState({ width: 300, height: 500 });
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Group audio files from nearby frames
  useEffect(() => {
    if (!frames.length) return;

    const currentFrame = frames[currentIndex];
    const currentTime = new Date(currentFrame.timestamp);
    const windowStart = new Date(currentTime.getTime() - groupingWindowMs);
    const windowEnd = new Date(currentTime.getTime() + groupingWindowMs);

    // Get frames within our time window
    const nearbyFrames = frames.filter((frame) => {
      const frameTime = new Date(frame.timestamp);
      return frameTime >= windowStart && frameTime <= windowEnd;
    });

    // Check if any nearby frames have audio
    const hasNearbyAudio = nearbyFrames.some(frame => 
      frame.devices.some(device => device.audio.length > 0)
    );

    // Show/hide panel based on nearby audio
    setIsVisible(hasNearbyAudio);

    // Group audio by device
    const groups = new Map<string, AudioGroup>();

    nearbyFrames.forEach((frame) => {
      frame.devices.forEach((device) => {
        device.audio.forEach((audio) => {
          const key = `${audio.device_name}-${audio.is_input}`;

          if (!groups.has(key)) {
            groups.set(key, {
              deviceName: audio.device_name,
              isInput: audio.is_input,
              audioItems: [],
              startTime: new Date(frame.timestamp),
              endTime: new Date(frame.timestamp),
            });
          }

          const group = groups.get(key)!;
          group.audioItems.push(audio);

          // Update time range
          const frameTime = new Date(frame.timestamp);
          if (frameTime < group.startTime) group.startTime = frameTime;
          if (frameTime > group.endTime) group.endTime = frameTime;
        });
      });
    });

    setAudioGroups(Array.from(groups.values()));
  }, [frames, currentIndex, groupingWindowMs]);

  const handlePlay = (audioPath: string) => {
    if (playing === audioPath) {
      setPlaying(null);
    } else {
      setPlaying(audioPath);
    }
  };

  const handlePanelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handlePanelMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handlePanelMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = windowSize.width;
    const startHeight = windowSize.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, startWidth + moveEvent.clientX - startX);
      const newHeight = Math.max(200, startHeight + moveEvent.clientY - startY);
      setWindowSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Modify the content scroll handler
  const handleContentScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Stop the event from reaching the timeline
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    onClose?.();
  };

  return isVisible ? (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: windowSize.width,
        height: windowSize.height,
        cursor: isDragging ? "grabbing" : "default",
      }}
      className="audio-transcript-panel bg-background/80 backdrop-blur border border-muted-foreground rounded-lg shadow-lg z-[100] overflow-hidden"
    >
      <div
        className="select-none cursor-grab active:cursor-grabbing p-2 border-b border-muted-foreground"
        onMouseDown={handlePanelMouseDown}
        onMouseMove={handlePanelMouseMove}
        onMouseUp={handlePanelMouseUp}
        onMouseLeave={handlePanelMouseUp}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4" />
            <span>audio transcripts</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div
        className="space-y-2 p-2 overflow-y-auto"
        style={{
          height: "calc(100% - 37px)",
          overscrollBehavior: "contain", // Prevent scroll chaining
          WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
        }}
      >
        {audioGroups.map((group, groupIndex) => (
          <Card key={groupIndex} className="p-4 bg-background/80 backdrop-blur">
            <div className="text-xs text-muted-foreground mb-2">
              {group.deviceName} ({group.isInput ? "input" : "output"})
              <div className="text-[10px]">
                {group.startTime.toLocaleTimeString()} -{" "}
                {group.endTime.toLocaleTimeString()}
              </div>
            </div>

            {group.audioItems.map((audio, index) => (
              <div key={index} className="space-y-2 mb-2 last:mb-0">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handlePlay(audio.audio_file_path)}
                  >
                    {playing === audio.audio_file_path ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <div className="flex items-center gap-1 text-xs">
                    <Volume2 className="h-3 w-3" />
                    <span>{Math.round(audio.duration_secs)}s</span>
                  </div>
                </div>

                {audio.transcription && (
                  <div className="text-xs pl-8 text-muted-foreground">
                    {audio.transcription}
                  </div>
                )}

                {playing === audio.audio_file_path && (
                  <div className="pl-8">
                    <VideoComponent filePath={audio.audio_file_path} />
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}
      </div>

      <div
        ref={resizerRef}
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent"
        style={{
          borderTopLeftRadius: "4px",
          borderBottomRightRadius: "4px",
          cursor: "se-resize",
        }}
      />
    </div>
  ) : null;
}
