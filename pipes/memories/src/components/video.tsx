import { memo, useCallback, useEffect, useState, useRef, useMemo } from "react";
import { getMediaFile } from "@/lib/actions/video-actions";
import { cn } from "@/lib/utils";

export const VideoComponent = memo(function VideoComponent({
  filePath,
  customDescription,
  className,
  startTime,
  endTime,
}: {
  filePath: string;
  customDescription?: string;
  className?: string;
  startTime?: number;
  endTime?: number;
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
    <div className="mt-2 text-center text-xs text-gray-500 truncate px-2" title={filePath}>
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
}: {
  startTime?: number;
  endTime?: number;
  mediaSrc: string;
}) {
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;

    const time = parseFloat(e.target.value);
    const wasPlaying = isPlaying;

    if (wasPlaying) {
      audioRef.current.pause();
    }

    // Set the time directly on the audio element first
    audioRef.current.currentTime = time;
    // Then update the state
    setCurrentTime(time);

    if (wasPlaying) {
      try {
        await audioRef.current.play();
      } catch (error) {
        console.error("Playback failed:", error);
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className="bg-gray-100 px-4 py-6 rounded-md">
      <div className="relative">
        {startTime !== null && (
          <div
            className="absolute top-[-8px] h-6 w-0.5 bg-black z-10"
            style={{
              left: `calc(88px + ${
                (startTime || 0) / duration
              } * calc(100% - 176px))`,
            }}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs">
              Start
            </div>
          </div>
        )}
        {endTime !== null && (
          <div
            className="absolute top-[-8px] h-6 w-0.5 bg-black z-10"
            style={{
              left: `calc(88px + ${
                (endTime || 0) / duration
              } * calc(100% - 176px))`,
            }}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs">
              End
            </div>
          </div>
        )}
        <button
          onClick={togglePlay}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black hover:bg-gray-800 text-white rounded-full"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="mx-[88px] relative">
          <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-black"
              style={{
                width: `${(currentTime / duration) * 100}%`,
              }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-x-1/3 -translate-y-1/2 w-2 h-2 bg-black rounded-full cursor-pointer hover:bg-gray-800 hover:h-4 hover:w-4"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            onChange={handleTimeChange}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            step="any"
          />
        </div>
        {audioElement}
      </div>
    </div>
  );
});
