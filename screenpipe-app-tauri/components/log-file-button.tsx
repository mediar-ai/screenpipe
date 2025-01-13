import { useToast } from "./ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { FileText, Copy } from "lucide-react";
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
import { useState } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import { LogViewer, LogViewerSearch } from "@patternfly/react-log-viewer";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core";

const LogContent = ({ content }: { content: string }) => {
  return (
    <LogViewer
      theme="dark"
      isTextWrapped={false}
      hasLineNumbers={true}
      data={content}
      height="58vh"
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <LogViewerSearch placeholder="Search value" minSearchChars={3} />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      }
    />
  );
};
LogContent.displayName = "LogContent";

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
  const { getDataDir } = useSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [logPath, setLogPath] = useState("");
  const [logContent, setLogContent] = useState("");
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);

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
    if (files.length > 0) {
      await loadLogContent(files[0].path);
    }
    setIsOpen(true);
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
            <DialogTitle>log files</DialogTitle>
            <DialogDescription>
              select a log file from the list to view its contents
            </DialogDescription>
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
                        <FileText className="h-3 w-3 mr-2" />
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
                      <LogContent content={logContent} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 focus:opacity-100"
                        onClick={() => copyToClipboard(logContent)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 bg-secondary/50 rounded-md">
                      <code className="text-sm font-mono">{logPath}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(logPath)}
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
