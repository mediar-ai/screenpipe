import { memo, useCallback, useEffect, useState, useRef, useMemo } from "react";
import { getMediaFile } from "@/lib/actions/video-actions";
import { cn } from "@/lib/utils";
import { Speaker } from "@screenpipe/browser";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pause, Play, Pencil, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export const VideoComponent = memo(function VideoComponent({
  filePath,
  customDescription,
  className,
  startTime,
  endTime,
  speaker,
}: {
  filePath: string;
  customDescription?: string;
  className?: string;
  startTime?: number;
  endTime?: number;
  speaker?: Speaker;
}) {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);

  const sanitizeFilePath = useCallback((path: string): string => {
    const isWindows = navigator.userAgent.includes("Windows");
    if (isWindows) {
      return path; // no sanitization on windows
    }
    return path
      .replace(/^["']|["']$/g, "")
      .trim()
      .replace(/\//g, "/");
  }, []);
  const renderFileLink = () => (
    <div
      className="mt-2 text-center text-xs text-gray-500 truncate px-2"
      title={filePath}
    >
      {customDescription || filePath}
    </div>
  );

  const validateMedia = async (path: string): Promise<string> => {
    try {
      const response = await fetch(
        `http://localhost:3030/experimental/validate/media?file_path=${encodeURIComponent(
          path
        )}`
      );
      const result = await response.json();
      return result.status;
    } catch (error) {
      console.error("Failed to validate media:", error);
      return "Failed to validate media";
    }
  };

  useEffect(() => {
    async function loadMedia() {
      try {
        const sanitizedPath = sanitizeFilePath(filePath);
        console.log("Sanitized path:", sanitizedPath);

        if (!sanitizedPath) {
          throw new Error("Invalid file path");
        }

        const validationStatus = await validateMedia(sanitizedPath);
        console.log("Media file:", validationStatus);

        if (validationStatus === "valid media file") {
          setIsAudio(
            sanitizedPath.toLowerCase().includes("input") ||
              sanitizedPath.toLowerCase().includes("output")
          );
          const { data, mimeType } = await getMediaFile(sanitizedPath);
          const binaryData = atob(data);
          const bytes = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          setMediaSrc(URL.createObjectURL(blob));
        } else if (validationStatus.startsWith("media file does not exist")) {
          throw new Error(
            `${
              isAudio ? "audio" : "video"
            } file not exists, it might get deleted`
          );
        } else if (validationStatus.startsWith("invalid media file")) {
          throw new Error(
            `the ${
              isAudio ? "audio" : "video"
            } file is not written completely, please try again later`
          );
        } else {
          throw new Error("unknown media validation status");
        }
      } catch (error) {
        console.warn("Failed to load media:", error);
        setError(
          `Failed to load media: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    loadMedia();
    return () => {
      if (mediaSrc) URL.revokeObjectURL(mediaSrc);
    };
  }, [filePath, sanitizeFilePath]);

  if (error) {
    return (
      <div className="w-full p-4 bg-red-100 border border-red-300 rounded-md">
        <p className="text-red-700">{error}</p>
        {renderFileLink()}
      </div>
    );
  }

  if (!mediaSrc) {
    return (
      <div
        className={cn(
          "w-full h-48 bg-gray-200 animate-pulse rounded-md flex items-center justify-center",
          className
        )}
      >
        <span className="text-gray-500">Loading media...</span>
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-2xl text-center", className)}>
      {isAudio ? (
        <AudioPlayer
          startTime={startTime}
          endTime={endTime}
          mediaSrc={mediaSrc}
          speaker={speaker}
        />
      ) : (
        <video controls className="w-full rounded-md">
          <source src={mediaSrc} type='video/mp4; codecs="hvc1"' />
          <source src={mediaSrc} type='video/mp4; codecs="hvec"' />
          <source src={mediaSrc} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}
      {renderFileLink()}
    </div>
  );
});

const AudioPlayer = memo(function AudioPlayer({
  startTime,
  endTime,
  mediaSrc,
  speaker,
}: {
  startTime?: number;
  endTime?: number;
  mediaSrc: string;
  speaker?: Speaker;
}) {
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [speakerName, setSpeakerName] = useState(speaker?.name || "");
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSpeakerNames, setShowSpeakerNames] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleUpdateSpeakerName = async () => {
    try {
      await fetch(`http://localhost:3030/speakers/update`, {
        method: "POST",
        body: JSON.stringify({
          id: speaker?.id,
          name: speakerName,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      setIsEditing(false);
    } catch (error) {
      console.error("error updating speaker name:", error);
    }
  };

  const fetchSpeakers = async (searchTerm: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(
        `http://localhost:3030/speakers/search?name=${searchTerm}`
      );
      const result = await response.json();
      setSpeakers(result);
    } catch (error) {
      console.error("error fetching speakers:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const audioElement = useMemo(
    () => (
      <audio
        ref={audioRef}
        className="w-full"
        preload="auto"
        onLoadedMetadata={(e) => {
          const audio = e.target as HTMLAudioElement;
          setDuration(audio.duration);
          if (startTime !== undefined) {
            audio.currentTime = startTime;
          }
        }}
        onTimeUpdate={(e) => {
          const audio = e.target as HTMLAudioElement;
          if (Math.abs(audio.currentTime - currentTime) > 0.1) {
            setCurrentTime(audio.currentTime);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      >
        <source src={mediaSrc} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    ),
    [mediaSrc, startTime, currentTime]
  );

  const togglePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    } catch (error) {
      console.error("Playback failed:", error);
      setIsPlaying(false);
    }
  };

  const handleTimeChange = async (value: number) => {
    if (!audioRef.current) return;

    const wasPlaying = isPlaying;
    if (wasPlaying) {
      audioRef.current.pause();
    }

    audioRef.current.currentTime = value;
    setCurrentTime(value);

    if (wasPlaying) {
      try {
        await audioRef.current.play();
      } catch (error) {
        console.error("Playback failed:", error);
        setIsPlaying(false);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border bg-card p-4 space-y-4"
    >
      {speaker && (
        <div className="mb-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white">
            {speakerName?.[0]?.toUpperCase() || "S"}
          </div>
          <div className="text-sm flex-1">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    value={speakerName}
                    onChange={(e) => {
                      setSpeakerName(e.target.value);
                      fetchSpeakers(e.target.value);
                    }}
                    onFocus={() => setShowSpeakerNames(true)}
                    onBlur={() =>
                      setTimeout(() => setShowSpeakerNames(false), 200)
                    }
                    className="h-8"
                    placeholder="Enter speaker name"
                  />
                  {showSpeakerNames && speakerName && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {isSearching ? (
                        <div className="flex justify-center items-center p-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                        </div>
                      ) : (
                        <ul className="py-1">
                          {speakers.map((s) => (
                            <li
                              key={s.id}
                              className="px-3 py-2 hover:bg-gray-100 cursor-pointer truncate"
                              onClick={() => {
                                setSpeakerName(s.name || "");
                                setShowSpeakerNames(false);
                              }}
                            >
                              {s.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleUpdateSpeakerName}
                  disabled={!speakerName}
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setSpeakerName(speaker.name || "");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="font-medium">
                  {speakerName || "Speaker " + speaker.id}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
            {speaker.metadata && !isEditing && (
              <div className="text-xs text-gray-600">{speaker.metadata}</div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={togglePlay}
            className="h-8 w-8 rounded-full"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <div className="relative flex-1">
            {startTime !== undefined && endTime !== undefined && (
              <div
                className="absolute top-[60%]  bg-primary/20 rounded-full"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                  width: `${((endTime - startTime) / duration) * 100}%`,
                }}
              />
            )}

            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={([value]) => handleTimeChange(value)}
              className="cursor-pointer"
            />

            {startTime !== undefined && (
              <div
                className="absolute top-4 w-2 h-2 bg-primary rounded-full -translate-x-1/2"
                title="start time where we found this audio transcript in the recorded file"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                }}
              >
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                  {formatTime(startTime)}
                </div>
              </div>
            )}

            {endTime !== undefined && (
              <div
                className="absolute top-4 w-2 h-2 bg-primary rounded-full -translate-x-1/2"
                title="end time where we found this audio transcript in the recorded file"
                style={{
                  left: `${(endTime / duration) * 100}%`,
                }}
              >
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                  {formatTime(endTime)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {audioElement}
    </motion.div>
  );
});
