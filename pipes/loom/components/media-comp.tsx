import { cn } from "@/lib/utils";
import { memo, useCallback, useEffect, useState } from "react";
import MediaThemeSutro from 'player.style/sutro/react';
import MediaThemeTailwindAudio from 'player.style/tailwind-audio/react';

export const MediaComponent = memo(function MediaComponent({
  filePath,
  className,
  customDescription,
}: {
  filePath: string;
  className?: string;
  customDescription?: string;
}) {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);

  const sanitizeFilePath = useCallback((path: string): string => {
    const isWindows = navigator.userAgent.includes("Windows");
    if (isWindows) {
      return path;
    }
    return path
      .replace(/^["']|["']$/g, "")
      .trim()
      .replace(/\//g, "/");
  }, []);

  const renderFileLink = () => (
    <div className="mt-2 text-center text-xs text-gray-500">
      {customDescription || filePath}
    </div>
  );

  useEffect(() => {
    async function loadMedia() {
      try {
        const sanitizedPath = sanitizeFilePath(filePath);

        if (!sanitizedPath) {
          throw new Error("Invalid file path");
        }

        const response = await fetch(`/api/file?path=${encodeURIComponent(sanitizedPath)}`);
        if (!response.ok) {
          throw new Error("Failed to fetch media file");
        }
        const blob = await response.blob();
        setMediaSrc(URL.createObjectURL(blob));

        setIsAudio(
          sanitizedPath.toLowerCase().includes("input") ||
          sanitizedPath.toLowerCase().includes("output")
        );
      } catch (error) {
        console.error("Failed to load media:", error);
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
      <div
        className={cn(
          "w-[60%] h-48 bg-gray-200 rounded-md flex-col flex items-center justify-center",
          className
        )}
      >
        <p className="text-red-700">{error}</p>
        {renderFileLink()}
      </div>
    );
  }

  if (!mediaSrc) {
    return (
      <div
        className={cn(
          "w-[60%] h-48 bg-gray-200 animate-pulse rounded-md flex-col flex items-center justify-center",
          className
        )}
      >
        <span className="text-gray-500">Loading media...</span>
      </div>
    );
  }

  return (
    <>
      {isAudio ?
        <MediaThemeTailwindAudio>
          <audio
            slot="media"
            src={mediaSrc}
            playsInline
          ></audio>
        </MediaThemeTailwindAudio>
        :
      <div className="rounded-xl block w-[80%] overflow-hidden">
        <MediaThemeSutro className="w-full h-full">
          <video 
            className="!mb-[-5px]"
            slot="media"
            src={mediaSrc}
            >
          </video>
        </MediaThemeSutro>
      </div>
      }
      {/* {renderFileLink()} */}
    </>
  );
});
