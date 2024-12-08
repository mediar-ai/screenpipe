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
import { useSettings } from "@/lib/hooks/use-settings";

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

  const getLogFilePath = async () => {
    const dataDir = await getDataDir();
    const logFileName = isAppLog ? "screenpipe-app" : "screenpipe";
    const os = platform();
    if (os === "macos" || os === "linux") {
      return `${dataDir}/${logFileName}.${new Date().toISOString().split("T")[0]}.log`
    }
    return `${dataDir}\\${logFileName}.${new Date().toISOString().split("T")[0]}.log`
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


  return (
    <div className={cn("flex", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("h-8 w-8", size === "8" && "h-8 w-8", size === "10" && "h-10 w-10", size === "12" && "h-12 w-12")}  
              onClick={handleOpenLogFile}
            >
              <FileText className={cn("h-4 w-4", size === "8" && "h-4 w-4", size === "10" && "h-6 w-6", size === "12" && "h-8 w-8")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>open {isAppLog ? "app " : ""}log file</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

    </div>
  );
};
