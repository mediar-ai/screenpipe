import { homeDir } from "@tauri-apps/api/path";
import { useToast } from "./ui/use-toast";
import { platform } from "@tauri-apps/plugin-os";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { FileText, Copy } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

export const LogFileButton = ({
  className,
  isAppLog = false,
}: {
  className?: string;
  isAppLog?: boolean;
}) => {
  const { toast } = useToast();
  const { copyToClipboard } = useCopyToClipboard({ timeout: 3000 });

  const getLogFilePath = async () => {
    const homeDirPath = await homeDir();
    const logFileName = isAppLog ? "screenpipe-app" : "screenpipe";
    return platform() === "windows"
      ? `${homeDirPath}\\.screenpipe\\${logFileName}.${
          new Date().toISOString().split("T")[0]
        }.log`
      : `${homeDirPath}/.screenpipe/${logFileName}.${
          new Date().toISOString().split("T")[0]
        }.log`;
  };

  const handleOpenLogFile = async () => {
    try {
      const logPath = await getLogFilePath();
      console.log("opening log file:", logPath);
      await open(logPath);
    } catch (error) {
      console.error("failed to open log file:", error);
      toast({
        title: "error",
        description: "failed to open log file.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleCopyLogs = async () => {
    try {
      const logPath = await getLogFilePath();
      const logContent = await readTextFile(logPath);
      copyToClipboard(logContent);
      toast({
        title: "success",
        description: "logs copied to clipboard.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to copy logs:", error);
      toast({
        title: "error",
        description: "failed to copy logs.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <div className={cn("flex", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenLogFile}
              className="mr-2"
            >
              <FileText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>open {isAppLog ? "app " : ""}log file</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={handleCopyLogs}>
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>copy logs to clipboard</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider> */}
    </div>
  );
};
