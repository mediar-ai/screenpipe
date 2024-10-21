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
import { FileText } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

export const LogFileButton = ({ className }: { className?: string }) => {
  const { toast } = useToast();
  const handleOpenLogFile = async () => {
    try {
      const homeDirPath = await homeDir();
      const logPath =
        platform() === "windows"
          ? `${homeDirPath}\\.screenpipe\\screenpipe.${
              new Date().toISOString().split("T")[0]
            }.log`
          : `${homeDirPath}/.screenpipe/screenpipe.${
              new Date().toISOString().split("T")[0]
            }.log`;
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenLogFile}
            className="ml-2"
          >
            <FileText className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>open log file</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
