import { Button } from "./ui/button";
import { useToast } from "./ui/use-toast";
import { Upload, Loader, Copy, X, Camera, Video } from "lucide-react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useSettings } from "@/lib/hooks/use-settings";
import { getVersion } from "@tauri-apps/api/app";
import {
  version as osVersion,
  platform as osPlatform,
} from "@tauri-apps/plugin-os";
import { Textarea } from "./ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip";

interface LogFile {
  name: string;
  path: string;
  modified_at: number;
}

interface VideoChunk {
  device_name: string;
  file_path: string;
  id: number;
}

const ShareLinkDisplay = ({
  shareLink,
  onCopy,
  onClose,
}: {
  shareLink: string;
  onCopy: () => void;
  onClose: () => void;
}) => {
  return (
    <div className="flex items-center gap-2 bg-secondary/30 px-3 py-2 rounded-lg border border-secondary animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center gap-2 flex-1">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-mono">{shareLink}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-secondary/50 transition-colors"
          onClick={onCopy}
          title="Copy share link"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-secondary/50 transition-colors text-muted-foreground"
          onClick={onClose}
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export const ShareLogsButton = ({
  showShareLink = true,
  onComplete,
}: {
  showShareLink?: boolean;
  onComplete?: () => void;
}) => {
  const { toast } = useToast();
  const { copyToClipboard } = useCopyToClipboard({ timeout: 3000 });
  const { settings } = useSettings();
  const [isSending, setIsSending] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [machineId, setMachineId] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null);

  useEffect(() => {
    const loadMachineId = async () => {
      let id = localStorage.getItem("machineId");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("machineId", id);
      }
      setMachineId(id);
    };
    loadMachineId();
  }, []);

  const getLogFiles = async () => {
    try {
      const logFiles = await invoke("get_log_files");
      return logFiles as LogFile[];
    } catch (error) {
      console.error("failed to get log files:", error);
      return [];
    }
  };

  const captureLastFiveMinutes = async () => {
    setIsLoadingVideo(true);
    try {
      // Fetch last video chunks
      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            SELECT * FROM video_chunks 
            ORDER BY id DESC
            LIMIT 6
          `,
        }),
      });

      if (!response.ok) throw new Error("failed to fetch video chunks");
      const chunks = (await response.json()) as VideoChunk[];

      // Merge frames
      const mergeResponse = await fetch(
        "http://localhost:3030/experimental/frames/merge",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_paths: chunks.map((c) => c.file_path),
          }),
        }
      );

      if (!mergeResponse.ok) throw new Error("failed to merge video chunks");
      const { video_path } = await mergeResponse.json();
      setMergedVideoPath(video_path);
    } catch (err) {
      console.error("failed to capture video:", err);
      toast({
        title: "video capture failed",
        description: "could not record last 5 minutes",
        variant: "destructive",
      });
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const handleScreenshotUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // Convert to data URL for preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshot(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to select screenshot:", err);
    }
  };

  const sendLogs = async () => {
    const logFiles = await getLogFiles();
    if (!logFiles.length) return;

    setIsSending(true);
    try {
      const BASE_URL = "https://screenpi.pe";
      const identifier = settings.user?.id || machineId;
      const type = settings.user?.id ? "user" : "machine";

      // Get all log contents
      const logContents = await Promise.all(
        logFiles.map(async (file) => ({
          name: file.name,
          content: await readTextFile(file.path),
        }))
      );

      const consoleLog = localStorage.getItem("console_logs") || "";

      const signedRes = await fetch(`${BASE_URL}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          type,
        }),
      });

      const {
        data: {
          signedUrl,
          path,
          signedUrlScreenshot,
          signedUrlVideo,
          screenshotPath,
          videoPath,
        },
      } = await signedRes.json();

      const combinedLogs =
        logContents
          .map((log) => `\n=== ${log.name} ===\n${log.content}`)
          .join("\n\n") +
        "\n\n=== Browser Console Logs ===\n" +
        consoleLog;

      await fetch(signedUrl, {
        method: "PUT",
        body: combinedLogs,
        headers: { "Content-Type": "text/plain" },
      });

      // Upload screenshot if exists
      if (screenshot && signedUrlScreenshot) {
        // Convert base64 to blob
        const response = await fetch(screenshot);
        const blob = await response.blob();

        // Upload directly using fetch
        await fetch(signedUrlScreenshot, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": blob.type },
        });
      }

      // Upload video if exists
      if (mergedVideoPath && signedUrlVideo) {
        console.log({
          filePath: mergedVideoPath,
          signedUrl: signedUrlVideo,
        });

        const videoUploaded = await invoke("upload_file_to_s3", {
          filePath: mergedVideoPath,
          signedUrl: signedUrlVideo,
        });
        if (!videoUploaded) throw new Error("Failed to upload video");
      }

      const os = osPlatform();
      const os_version = osVersion();
      const app_version = await getVersion();

      const confirmRes = await fetch(`${BASE_URL}/api/logs/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          identifier,
          type,
          os,
          os_version,
          app_version,
          feedback_text: feedbackText,
          screenshot_url: screenshotPath,
          video_url: videoPath,
        }),
      });

      const {
        data: { id },
      } = await confirmRes.json();
      setShareLink(`${BASE_URL}/logs/${id}`);
    } catch (err) {
      console.error("log sharing failed:", err);
      toast({
        title: "sharing failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      if (!showShareLink) {
        toast({
          title: "feedback sent",
          description: "thanks for your feedback!",
        });
      }
      if (onComplete) onComplete();
      setIsSending(false);
    }
  };
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        {!shareLink ? (
          <>
            <Textarea
              placeholder="describe your feedback or issue..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="min-h-[120px] resize-none rounded-xl bg-secondary/5 placeholder:text-muted-foreground/50 focus:border-secondary/30 focus:ring-0 transition-colors"
            />

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer flex-none">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScreenshotUpload}
                  disabled={!!screenshot}
                />
                <Button
                  variant={screenshot ? "secondary" : "outline"}
                  size="sm"
                  className={`gap-2 h-9 px-4 rounded-full transition-all ${
                    screenshot
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                      : ""
                  }`}
                  disabled={!!screenshot}
                  asChild
                >
                  <span>
                    <Camera className="h-3.5 w-3.5" />
                    <span>screenshot</span>
                  </span>
                </Button>
              </label>

              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant={mergedVideoPath ? "secondary" : "outline"}
                    size="sm"
                    onClick={captureLastFiveMinutes}
                    className={`gap-2 h-9 px-4 rounded-full transition-all ${
                      mergedVideoPath
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                        : ""
                    }`}
                    disabled={isLoadingVideo}
                  >
                    {isLoadingVideo ? (
                      <Loader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Video className="h-3.5 w-3.5" />
                    )}
                    <span>recording</span>
                    <span className="ml-1 text-xs text-muted-foreground/70">
                      5m
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="text-xs bg-secondary/80 backdrop-blur-sm border-secondary/30"
                >
                  Attach last 5 minutes of screen recording
                </TooltipContent>
              </Tooltip>
            </div>

            {screenshot && (
              <div className="relative w-48 aspect-video rounded-xl overflow-hidden bg-secondary/10 border border-secondary/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshot}
                  alt="Screenshot preview"
                  className="object-cover w-full h-full"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 hover:bg-background/95 backdrop-blur-sm"
                  onClick={() => setScreenshot(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={sendLogs}
              disabled={isSending || !feedbackText.trim()}
              className="gap-2 group relative h-10 px-5 rounded-full"
            >
              {isSending ? (
                <>
                  <Loader className="h-3.5 w-3.5 animate-spin" />
                  <span>sending feedback...</span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
                  <span>send feedback</span>
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            {showShareLink && (
              <ShareLinkDisplay
                shareLink={shareLink}
                onCopy={() => copyToClipboard(shareLink)}
                onClose={() => {
                  setShareLink("");
                  setFeedbackText("");
                  setScreenshot(null);
                  setMergedVideoPath(null);
                }}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
};
