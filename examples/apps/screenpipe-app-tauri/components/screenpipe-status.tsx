"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeBlock } from "@/components/ui/codeblock";
import { platform } from "@tauri-apps/plugin-os";
import { MarkdownWithExternalLinks } from "./markdown-with-external-links";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useSettings } from "@/lib/hooks/use-settings";
import { invoke } from "@tauri-apps/api/core";
import { toast, useToast } from "./ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Card, CardContent, CardFooter } from "./ui/card";
import { useHealthCheck } from "@/lib/hooks/use-health-check";

const getDebuggingCommands = (os: string | null) => {
  const cliInstructions =
    os === "windows"
      ? "# 1. Open Command Prompt as admin (search for 'cmd' in the Start menu, right click, 'Run as admin')\n# 2. Navigate to: %LOCALAPPDATA%\\screenpipe\\\n#    Type: cd %LOCALAPPDATA%\\screenpipe\n"
      : "# 1. Open Terminal\n# 2. Navigate to: $HOME/.screenpipe/\n#    Type: cd $HOME/.screenpipe\n";

  const baseInstructions = `# First, view the Screenpipe CLI arguments:
${cliInstructions}
# 3. Run: screenpipe -h
# 4. Choose your preferred setup and start Screenpipe:
#    (Replace [YOUR_ARGS] with your chosen arguments)
#    Example: screenpipe --data-dir `;

  const dataDir =
    os === "windows" ? "%USERPROFILE%\\.screenpipe" : "$HOME/.screenpipe";

  const logPath =
    os === "windows"
      ? "%USERPROFILE%\\.screenpipe\\screenpipe.log"
      : "$HOME/.screenpipe/screenpipe.log";

  const dbPath =
    os === "windows"
      ? "%USERPROFILE%\\.screenpipe\\db.sqlite"
      : "$HOME/.screenpipe/db.sqlite";

  const baseCommand =
    baseInstructions +
    dataDir +
    (os === "windows"
      ? "\n\n# We highly recommend adding --ocr-engine windows-native to your command.\n# This will use a very experimental but powerful engine to extract text from your screen instead of the default one.\n# Example: screenpipe --data-dir %USERPROFILE%\\.screenpipe --ocr-engine windows-native\n"
      : "") +
    "\n\n# 5. If you've already started Screenpipe, try these debugging commands:\n";

  if (os === "windows") {
    return (
      baseCommand +
      `# Stream the log:
type "${logPath}"

# Scroll the logs:
more "${logPath}"

# View last 10 frames:
sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
    );
  } else if (os === "macos" || os === "linux") {
    return (
      baseCommand +
      `# Stream the log:
tail -f "${logPath}"

# Scroll the logs:
less "${logPath}"

# View last 10 frames:
sqlite3 "${dbPath}" "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 "${dbPath}" "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
    );
  } else {
    return "OS not recognized. \n\nPlease check the documentation for your specific operating system.";
  }
};

const DevModeSettings = () => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const handleDevModeToggle = (checked: boolean) => {

    setLocalSettings((prev) => ({ ...prev, devMode: checked }));
    updateSettings({ devMode: checked });
  };
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleStartScreenpipe = async () => {
    setIsLoading(true);
    const toastId = toast({
      title: "starting screenpipe",
      description: "please wait...",
      duration: Infinity,
    });
    try {
      await invoke("spawn_screenpipe");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toastId.update({
        id: toastId.id,
        title: "screenpipe started",
        description: "screenpipe is now running.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to start screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to start screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  const handleStopScreenpipe = async () => {
    setIsLoading(true);
    const toastId = toast({
      title: "stopping screenpipe",
      description: "please wait...",
      duration: Infinity,
    });
    try {
      await invoke("kill_all_sreenpipes");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toastId.update({
        id: toastId.id,
        title: "screenpipe stopped",
        description: "screenpipe is now stopped.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to stop screenpipe:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to stop screenpipe.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      toastId.dismiss();
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full my-4">
        <div className="flex  justify-around">
          <Card className="p-4 ">
            <CardContent>
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="dev-mode">enable dev mode</Label>
                  <Switch
                    id="dev-mode"
                    checked={localSettings.devMode}
                    onCheckedChange={handleDevModeToggle}
                  />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  on = use CLI for more control
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="relative">
            <Badge
              variant="secondary"
              className="text-xs absolute -top-3 left-1/2 transform -translate-x-1/2 z-10"
            >
              expert only
            </Badge>
            <Card className="p-4">
              <CardContent>
                <div className="flex items-center space-x-2">
                  <div className="flex flex-col items-center w-full">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            onClick={handleStopScreenpipe}
                            disabled={isLoading}
                            className="text-xs w-full"
                          >
                            stop
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>stop screenpipe backend</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex flex-col items-center w-full">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            onClick={handleStartScreenpipe}
                            disabled={isLoading}
                            className="text-xs w-full"
                          >
                            start
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>start screenpipe backend</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-center">
                <p className="text-sm text-muted-foreground">
                  start or stop screenpipe backend
                </p>
                <p className="text-xs text-muted-foreground">
                  (auto started when dev mode is off)
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
      {/* vertical separator */}
      <Separator orientation="vertical" />
      {settings.devMode === true && (
        <>
          <p className="font-bold my-2">
            did you run screenpipe backend? either click start on the right, or
            thru CLI 👇
          </p>
          <CodeBlock language="bash" value={getDebuggingCommands(platform())} />

          <div className="mt-4 text-sm text-gray-500">
            <p>or, for more advanced queries:</p>
            <ol className="list-decimal list-inside mt-2">
              <li>
                <a
                  href="https://github.com/louis030195/screen-pipe/blob/main/screenpipe-server/src/db.rs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  go to the database schema
                </a>
              </li>
              <li>Copy the entire page (Cmd+A, Cmd+C)</li>
              <li>Paste into ChatGPT (Cmd+V)</li>
              <li>
                ask: &quot;give me 10 sqlite query CLI to look up my data. My db
                is in $HOME/.screenpipe/db.sqlite&quot;
              </li>
            </ol>
            <p className="mt-2">
              or if you prefer using curl, follow the same steps with the{" "}
              <a
                href="https://github.com/louis030195/screen-pipe/blob/main/screenpipe-server/src/server.rs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                server.rs file
              </a>{" "}
              and ask ChatGPT for curl commands to interact with the API.
            </p>
          </div>
        </>
      )}
    </>
  );
};

interface HealthCheckResponse {
  status: string;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  message: string;
}

const HealthStatus = ({ className }: { className?: string }) => {
  const { health } = useHealthCheck();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Healthy":
        return "bg-green-500";
      case "Loading":
        return "bg-yellow-500";
      case "Unhealthy":
      case "Error":
        return "bg-red-500";
      default:
        return "bg-red-500";
    }
  };

  if (!health) return null;

  const formatTimestamp = (timestamp: string | null) => {
    return timestamp ? new Date(timestamp).toLocaleString() : "N/A";
  };

  return (
    <>
      <Badge
        variant="outline"
        className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => setIsDialogOpen(true)}
      >
        Status{" "}
        <span
          className={`ml-1 w-2 h-2 rounded-full ${getStatusColor(
            health.status
          )} inline-block ${
            health.status === "Unhealthy" || health.status === "Error"
              ? "animate-pulse"
              : ""
          }`}
        />
      </Badge>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-3xl max-h-[80vh] flex flex-col"
          aria-describedby="status-dialog-description"
        >
          <DialogHeader>
            <DialogTitle>{health.status.toLowerCase()} status</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-2">
              {health.message.toLowerCase()}{" "}
              {health.status === "Loading" && (
                <span className="ml-1 text-xs">(up to 3m)</span>
              )}
            </p>
            <p className="text-xs mb-1">
              frame: {health.frame_status.toLowerCase()}
            </p>
            <p className="text-xs mb-1">
              audio: {health.audio_status.toLowerCase()}
            </p>
            <p className="text-xs mb-1">
              last frame: {formatTimestamp(health.last_frame_timestamp)}
            </p>
            <p className="text-xs mb-1">
              last audio: {formatTimestamp(health.last_audio_timestamp)}
            </p>
            <div className="text-xs mt-2">
              <p className="font-bold mb-1">troubleshooting Instructions:</p>
              <MarkdownWithExternalLinks className="prose prose-sm">
                {`if you're experiencing issues, please try the following steps:
1. restart screenpipe
2. reset your screenpipe OS audio/screen recording permissions
3. if the problem persists, please contact support at [louis@screenpi.pe](mailto:louis@screenpi.pe) or @louis030195 on Discord, X, or LinkedIn
4. last, here are some [FAQ](https://github.com/louis030195/screen-pipe/blob/main/content/docs/NOTES.md) with visuals to help you troubleshoot`}
              </MarkdownWithExternalLinks>
            </div>
            <Separator className="my-4" />
            <DevModeSettings />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
