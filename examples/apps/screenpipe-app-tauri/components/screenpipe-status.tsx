"use client";
import React, { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "./markdown";
import { invoke } from "@tauri-apps/api/core";
import { spinner } from "./spinner";
import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { platform } from "@tauri-apps/plugin-os";
import { MarkdownWithExternalLinks } from "./markdown-with-external-links";
import { Badge } from "./ui/badge";
interface HealthCheckResponse {
  status: string;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  message: string;
}

const HealthStatus = ({ className }: { className?: string }) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchHealth = async () => {
    try {
      const response = await fetch("http://localhost:3030/health");
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status} ${text}`);
      }
      const data: HealthCheckResponse = await response.json();
      if (health && data.status !== health.status) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 5000); // Blink for 5 seconds on status change
      }
      setHealth(data);
      // setError(null);
    } catch (error) {
      console.error("Failed to fetch health status:", error);
      // setError("Failed to fetch health status. Server might be down.");
      setHealth({
        last_frame_timestamp: null,
        last_audio_timestamp: null,
        frame_status: "Error",
        audio_status: "Error",
        status: "Error",
        message: "Failed to fetch health status. Server might be down.",
      });
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 1000); // Poll every 1 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDebuggingCommands = (os: string | null) => {
    const cliInstructions =
      os === "windows"
        ? "# 1. Open Command Prompt (search for &apos;cmd&apos; in the Start menu)\n# 2. Navigate to: %APPDATA%\\screenpipe\\\n#    Type: cd %APPDATA%\\screenpipe\n"
        : os === "macos"
        ? "# 1. Open Terminal app\n# 2. Navigate to: /Applications/screenpipe.app/Contents/MacOS/\n#    Type: cd /Applications/screenpipe.app/Contents/MacOS/\n"
        : "# 1. Open Terminal\n# 2. Navigate to the Screenpipe installation directory\n";

    const baseInstructions = `# First, view the Screenpipe CLI arguments:
${cliInstructions}
# 3. Run: screenpipe -h
# 4. Choose your preferred setup and start Screenpipe:
#    (Replace [YOUR_ARGS] with your chosen arguments)
#    Example: screenpipe --data-dir `;

    const dataDir =
      os === "windows"
        ? "%APPDATA%\\screenpipe"
        : os === "macos"
        ? "$HOME/Library/Application\\ Support/screenpipe"
        : "$HOME/.config/screenpipe";

    const baseCommand =
      baseInstructions +
      dataDir +
      "\n\n# 5. If you've already started Screenpipe, try these debugging commands:\n";

    if (os === "windows") {
      return (
        baseCommand +
        `# Stream the log (depending how you set the data-dir):
Get-Content -Wait $env:APPDATA\\screenpipe\\screenpipe.log

# Scroll the logs:
Get-Content $env:APPDATA\\screenpipe\\screenpipe.log | more

# View last 10 frames:
sqlite3 $env:APPDATA\\screenpipe\\db.sqlite "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 $env:APPDATA\\screenpipe\\db.sqlite "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
      );
    } else if (os === "macos") {
      return (
        baseCommand +
        `# Stream the log (depending how you set the data-dir):
tail -f $HOME/Library/Application\\ Support/screenpipe/screenpipe.log

# Scroll the logs:
less $HOME/Library/Application\\ Support/screenpipe/screenpipe.log

# View last 10 frames:
sqlite3 $HOME/Library/Application\\ Support/screenpipe/db.sqlite "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 $HOME/Library/Application\\ Support/screenpipe/db.sqlite "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
      );
    } else if (os === "linux") {
      return (
        baseCommand +
        `# Stream the log (depending how you set the data-dir):
tail -f $HOME/.config/screenpipe/screenpipe.log

# Scroll the logs:
less $HOME/.config/screenpipe/screenpipe.log

# View last 10 frames:
sqlite3 $HOME/.config/screenpipe/db.sqlite "SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 $HOME/.config/screenpipe/db.sqlite "SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`
      );
    } else {
      return "OS not recognized. \n\nPlease check the documentation for your specific operating system.";
    }
  };

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
        return "bg-gray-500";
    }
  };

  if (health && health.status === "Error") {
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
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Error Status</DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-auto">
              <p className="text-sm mb-4">{health.message}</p>
              <div className="text-xs text-red-500">
                <p className="font-bold mb-1">Troubleshooting Instructions:</p>
                <MarkdownWithExternalLinks className="prose prose-sm">
                  {`If you're experiencing issues, please try the following steps:
1. Restart screenpipe CLI.
2. Reset your Screenpipe OS audio/screen recording permissions.
3. If the problem persists, please contact support at [louis@screenpi.pe](mailto:louis@screenpi.pe) or @louis030195 on Discord, X, or LinkedIn.
4. Last, here are some [FAQ](https://github.com/louis030195/screen-pipe/blob/main/content/docs/NOTES.md) with visuals to help you troubleshoot.`}
                </MarkdownWithExternalLinks>
                <p className="font-bold mt-2 text-red-500">
                  Did you run screenpipe CLI first?
                </p>
              </div>
              <CodeBlock
                language="bash"
                value={getDebuggingCommands(platform())}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

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
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{health.status} Status</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <p className="text-sm mb-2">{health.message}</p>
            <p className="text-xs mb-1">Frame: {health.frame_status}</p>
            <p className="text-xs mb-1">Audio: {health.audio_status}</p>
            <p className="text-xs mb-1">
              Last Frame: {formatTimestamp(health.last_frame_timestamp)}
            </p>
            <p className="text-xs mb-1">
              Last Audio: {formatTimestamp(health.last_audio_timestamp)}
            </p>
            <div className="text-xs mt-2 text-red-500">
              <p className="font-bold mb-1">Troubleshooting Instructions:</p>
              <MarkdownWithExternalLinks className="prose prose-sm">
                {`If you're experiencing issues, please try the following steps:
1. Restart screenpipe CLI.
2. Reset your Screenpipe OS audio/screen recording permissions.
3. If the problem persists, please contact support at [louis@screenpi.pe](mailto:louis@screenpi.pe) or @louis030195 on Discord, X, or LinkedIn.
4. Last, here are some [FAQ](https://github.com/louis030195/screen-pipe/blob/main/content/docs/NOTES.md) with visuals to help you troubleshoot.`}
              </MarkdownWithExternalLinks>
              <p className="font-bold mt-2 text-red-500">
                Did you run screenpipe CLI first?
              </p>
            </div>
            <CodeBlock
              language="bash"
              value={getDebuggingCommands(platform())}
            />

            <div className="mt-4 text-sm text-gray-500">
              <p>Or, for more advanced queries:</p>
              <ol className="list-decimal list-inside mt-2">
                <li>
                  <a
                    href="https://github.com/louis030195/screen-pipe/blob/main/screenpipe-server/src/db.rs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Go to the database schema
                  </a>
                </li>
                <li>Copy the entire page (Cmd+A, Cmd+C)</li>
                <li>Paste into ChatGPT (Cmd+V)</li>
                <li>
                  Ask: &quot;give me 10 sqlite query CLI to look up my data. My
                  db is in $HOME/.screenpipe/db.sqlite&quot;
                </li>
              </ol>
              <p className="mt-2">
                Or if you prefer using curl, follow the same steps with the{" "}
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
