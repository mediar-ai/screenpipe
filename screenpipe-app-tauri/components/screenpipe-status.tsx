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
import { Lock, Folder, FileText, Activity } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { homeDir } from "@tauri-apps/api/path";
import LogViewer from "./log-viewer-v2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const getDebuggingCommands = (os: string | null) => {
  let cliInstructions = "";

  if (os === "windows") {
    cliInstructions =
      "# 1. Open Command Prompt as admin (search for 'cmd' in the Start menu, right click, 'Run as admin')\n# 2. Navigate to: %LOCALAPPDATA%\\screenpipe\\\n#    Type: cd %LOCALAPPDATA%\\screenpipe\n";
  } else if (os === "macos") {
    cliInstructions =
      "# 1. Open Terminal\n# 2. Navigate to: /Applications/screenpipe.app/Contents/MacOS/\n#    Type: cd /Applications/screenpipe.app/Contents/MacOS/\n";
  } else if (os === "linux") {
    cliInstructions =
      "# 1. Open Terminal\n# 2. Navigate to: /usr/local/bin/\n#    Type: cd /usr/local/bin/\n";
  } else {
    cliInstructions =
      "# OS not recognized. Please check the documentation for your specific operating system.\n";
  }

  const baseInstructions = `# First, view the Screenpipe CLI arguments:
${cliInstructions}
# 3. Run: screenpipe -h
# 4. Choose your preferred setup and start Screenpipe:
#    (Replace [YOUR_ARGS] with your chosen arguments)
#    Example: screenpipe --fps 1 `;

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
  const handleDevModeToggle = async (checked: boolean) => {
    try {
      await updateSettings({ devMode: checked });
      setLocalSettings({ ...localSettings, devMode: checked });
    } catch (error) {
      console.error("Failed to update dev mode:", error);
      // Add error handling, e.g., show a toast notification
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
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
                  <br />
                  in dev mode, backend won&apos;t <br />
                  auto start when starting the app
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="relative">
            <Badge className="text-xs absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
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
                  href="https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-server/src/db.rs"
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
                href="https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-server/src/server.rs"
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

const HealthStatus = ({ className }: { className?: string }) => {
  const { health } = useHealthCheck();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const { settings } = useSettings();
  const [isLogOpen, setIsLogOpen] = useState(false);

  useEffect(() => {
    setIsMac(platform() === "macos");
  }, []);

  const handleResetScreenPermissions = async () => {
    const toastId = toast({
      title: "opening permissions",
      description: "please wait...",
      duration: Infinity,
    });

    try {
      await invoke("open_screen_capture_preferences");
    } catch (error) {
      console.error("failed to open screen permissions:", error);
      toastId.update({
        id: toastId.id,
        title: "error",
        description: "failed to open screen permissions.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleOpenDataDir = async () => {
    try {
      const homeDirPath = await homeDir();

      const dataDir =
        platform() === "macos" || platform() === "linux"
          ? `${homeDirPath}/.screenpipe`
          : `${homeDirPath}\\.screenpipe`;
      await open(dataDir as string);
    } catch (error) {
      console.error("failed to open data directory:", error);
      toast({
        title: "error",
        description: "failed to open data directory.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleOpenLogFile = async () => {
    try {
      const homeDirPath = await homeDir();
      const logPath =
        platform() === "windows"
          ? `${homeDirPath}\\.screenpipe\\screenpipe.log`
          : `${homeDirPath}/.screenpipe/screenpipe.log`;
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

  const getStatusColor = (
    status: string,
    frameStatus: string,
    audioStatus: string,
    audioDisabled: boolean
  ) => {
    if (status === "loading") return "bg-yellow-500";

    const isVisionOk = frameStatus === "ok" || frameStatus === "disabled";
    const isAudioOk =
      audioStatus === "ok" || audioStatus === "disabled" || audioDisabled;

    if (isVisionOk && isAudioOk) return "bg-green-500";
    return "bg-red-500";
  };

  if (!health) return null;

  const formatTimestamp = (timestamp: string | null) => {
    return timestamp ? new Date(timestamp).toLocaleString() : "n/a";
  };

  const getStatusMessage = (
    status: string,
    frameStatus: string,
    audioStatus: string,
    audioDisabled: boolean
  ) => {
    if (status === "loading")
      return "the application is still initializing. please wait...";

    let unhealthySystems = [];
    if (frameStatus !== "ok" && frameStatus !== "disabled")
      unhealthySystems.push("vision");
    if (!audioDisabled && audioStatus !== "ok" && audioStatus !== "disabled")
      unhealthySystems.push("audio");

    if (unhealthySystems.length === 0)
      return "all systems are functioning normally";
    return `some systems are not functioning properly: ${unhealthySystems.join(
      ", "
    )}`;
  };

  const statusColor = getStatusColor(
    health.status,
    health.frame_status,
    health.audio_status,
    settings.disableAudio
  );
  const statusMessage = getStatusMessage(
    health.status,
    health.frame_status,
    health.audio_status,
    settings.disableAudio
  );

  return (
    <>
      <Badge
        variant="outline"
        className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => setIsDialogOpen(true)}
      >
        <Activity className="mr-2 h-4 w-4" />
        status{" "}
        <span
          className={`ml-1 w-2 h-2 rounded-full ${statusColor} inline-block ${
            statusColor === "bg-red-500" ? "animate-pulse" : ""
          }`}
        />
      </Badge>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-3xl max-h-[80vh] flex flex-col p-8"
          aria-describedby="status-dialog-description"
        >
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>{health.status} status</DialogTitle>

            <Button
              variant="outline"
              onClick={handleOpenDataDir}
              className="flex-shrink-0"
            >
              <Folder className="h-4 w-4 mr-2" />
              open data dir
            </Button>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-2">
              {statusMessage}
              {health.status === "loading" && (
                <span className="ml-1 text-xs">(up to 3m)</span>
              )}
            </p>
            <p className="text-xs mb-1">frame: {health.frame_status}</p>
            <p className="text-xs mb-1">
              audio: {settings.disableAudio ? "disabled" : health.audio_status}
            </p>
            <p className="text-xs mb-1">
              last frame: {formatTimestamp(health.last_frame_timestamp)}
            </p>
            <p className="text-xs mb-1">
              last audio:{" "}
              {settings.disableAudio
                ? "n/a"
                : formatTimestamp(health.last_audio_timestamp)}
            </p>
            <div className="text-xs mt-2 relative">
              <p className="font-bold mb-1">troubleshooting instructions:</p>
              <MarkdownWithExternalLinks className="prose prose-sm">
                {`if you're experiencing issues, please try the following steps:
1. restart screenpipe
2. reset your screenpipe OS audio/screen recording permissions
3. if the problem persists, please contact support at [louis@screenpi.pe](mailto:louis@screenpi.pe) or @louis030195 on Discord, X, or LinkedIn
4. last, here are some [FAQ](https://github.com/mediar-ai/screenpipe/blob/main/content/docs/NOTES.md) with visuals to help you troubleshoot`}
              </MarkdownWithExternalLinks>
              {isMac && (
                <div className="absolute top-[6.5em] right-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={handleResetScreenPermissions}
                          className="flex-shrink-0"
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          open permissions
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>open screen capture permissions</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <DevModeSettings />

            <Collapsible
              open={isLogOpen}
              onOpenChange={setIsLogOpen}
              className="w-full mt-4"
            >
              <div className="flex items-center justify-between w-full">
                <CollapsibleTrigger className="flex items-center justify-between p-2 flex-grow border-b border-gray-200">
                  recorder logs
                  <span>{isLogOpen ? "▲" : "▼"}</span>
                </CollapsibleTrigger>
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
              </div>
              <CollapsibleContent>
                <LogViewer className="mt-2" />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
