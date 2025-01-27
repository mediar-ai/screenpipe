import { toast, useToast } from "./ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { FileText, Copy, AppWindow, Loader, X, Upload } from "lucide-react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogDescription,
} from "./ui/dialog";
import { useState, useEffect } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { LogViewer, LogViewerSearch } from "@patternfly/react-log-viewer";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core";
import { open } from "@tauri-apps/plugin-shell";
import { getVersion } from '@tauri-apps/api/app';
import { version as osVersion, platform as osPlatform } from '@tauri-apps/plugin-os';

const LogContent = ({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) => {
  const handleOpenInDefaultApp = async () => {
    try {
      await open(filePath);
    } catch (error) {
      console.error("failed to open log file:", error);
      toast({
        title: "error",
        description: "failed to open log file",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative">
      <LogViewer
        theme="dark"
        isTextWrapped={false}
        hasLineNumbers={true}
        data={content}
        height="58vh"
        toolbar={
          <Toolbar>
            <ToolbarContent className="p-2 relative w-full">
              <ToolbarItem>
                <LogViewerSearch
                  placeholder="Search value"
                  minSearchChars={3}
                />
              </ToolbarItem>
              <ToolbarItem className="p-2 absolute right-0 top-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInDefaultApp}
                >
                  open in default app
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        }
      />
    </div>
  );
};
LogContent.displayName = "LogContent";

const ShareLogButton = ({
  onShare,
  isSending,
}: {
  onShare: () => void;
  isSending: boolean;
}) => {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onShare}
      disabled={isSending}
      className="gap-2 group relative"
    >
      {isSending ? (
        <>
          <Loader className="h-3.5 w-3.5 animate-spin" />
          <span>sharing...</span>
        </>
      ) : (
        <>
          <Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          <span>share logs</span>
        </>
      )}
    </Button>
  );
};

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

export const LogFileButton = ({
  className,
  isAppLog = false,
  size = "8",
}: {
  className?: string;
  isAppLog?: boolean;
  size?: "8" | "10" | "12";
}) => {
  const { toast } = useToast();
  const { copyToClipboard } = useCopyToClipboard({ timeout: 3000 });
  const { settings } = useSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [logPath, setLogPath] = useState("");
  const [logContent, setLogContent] = useState("");
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [machineId, setMachineId] = useState("");

  interface LogFile {
    name: string;
    path: string;
    modified_at: number;
  }
  const getLogFiles = async () => {
    try {
      const logFiles = await invoke("get_log_files");
      return logFiles as LogFile[];
    } catch (error) {
      console.error("failed to get log files:", error);
      return [];
    }
  };

  const loadLogContent = async (filePath: string) => {
    try {
      console.log("loadLogContent", filePath);

      const content = await readTextFile(filePath);
      setLogPath(filePath);
      setLogContent(content);
    } catch (error) {
      console.error("failed to read log file:", error);
      toast({
        title: "error",
        description: "failed to read log file",
        variant: "destructive",
      });
    }
  };

  const handleShowLog = async () => {
    const files = await getLogFiles();
    setLogFiles(files);

    // Find most recent app log or fall back to first file
    const appLog = files
      .filter((f) => f.name.toLowerCase().includes("app"))
      .sort((a, b) => b.modified_at - a.modified_at)[0];

    if (files.length > 0) {
      await loadLogContent(appLog?.path || files[0].path);
    }
    setIsOpen(true);
  };

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

  const sendLogs = async () => {
    if (!logContent) return;

    setIsSending(true);
    try {
      const BASE_URL =
        (await invoke("get_env", { name: "BASE_URL_PRIVATE" })) ??
        "https://screenpi.pe";
      const identifier = settings.user?.id || machineId;
      const type = settings.user?.id ? "user" : "machine";

      // Get signed URL
      const signedRes = await fetch(`${BASE_URL}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, type }),
      });

      const {
        data: { signedUrl, path },
      } = await signedRes.json();

      // Upload log content
      await fetch(signedUrl, {
        method: "PUT",
        body: logContent,
        headers: { "Content-Type": "text/plain" },
      });

      const os = osPlatform();
      const os_version = osVersion();
      const app_version = await getVersion();

      // Confirm upload
      const confirmRes = await fetch(`${BASE_URL}/api/logs/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, identifier, type, os, os_version, app_version }),
      });

      const {
        data: { id },
      } = await confirmRes.json();
      setShareLink(`${BASE_URL}/logs/${id}`);
    } catch (err) {
      console.error("log sharing failed:", err);
      toast({
        title: "sharing failed",
        description: "could not upload logs",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-8 w-8",
                size === "8" && "h-8 w-8",
                size === "10" && "h-10 w-10",
                size === "12" && "h-12 w-12"
              )}
              onClick={handleShowLog}
            >
              <FileText
                className={cn(
                  "h-4 w-4",
                  size === "8" && "h-4 w-4",
                  size === "10" && "h-6 w-6",
                  size === "12" && "h-8 w-8"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>view {isAppLog ? "app " : ""}log files</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[90vw] h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex flex-row justify-between items-start w-full">
              <div>
                <DialogTitle>log files</DialogTitle>
                <DialogDescription>
                  <span>select a log file from the list</span>
                </DialogDescription>
              </div>
              <div className="flex mr-8">
                {!shareLink && (
                  <ShareLogButton onShare={sendLogs} isSending={isSending} />
                )}
              </div>
            </div>
            {shareLink && (
              <ShareLinkDisplay
                shareLink={shareLink}
                onCopy={() => copyToClipboard(shareLink)}
                onClose={() => setShareLink("")}
              />
            )}
          </DialogHeader>

          {logFiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <FileText className="h-12 w-12 mb-4 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                no log files found yet, come back later
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[250px,1fr] gap-4 h-[calc(100%-80px)]">
              {/* Sidebar with log files list */}
              <div className="border rounded-md overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    {logFiles.map((file, i) => (
                      <Button
                        key={i}
                        variant={
                          logPath === file.modified_at.toString()
                            ? "secondary"
                            : "ghost"
                        }
                        className="w-full justify-start text-xs"
                        onClick={() => loadLogContent(file.path)}
                      >
                        {file.name.includes("app") ? (
                          <AppWindow className="h-3 w-3 mr-2" />
                        ) : (
                          <FileText className="h-3 w-3 mr-2" />
                        )}
                        <span className="truncate">{file.name}</span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Content area */}
              <div className="flex flex-col space-y-2 h-full">
                {logPath && (
                  <>
                    <div className="relative flex-1 border rounded-md">
                      <LogContent content={logContent} filePath={logPath} />
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 bg-secondary/50 rounded-md">
                      <code
                        className="text-sm font-mono truncate max-w-[70%]"
                        title={logPath}
                      >
                        {logPath}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(logContent)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
