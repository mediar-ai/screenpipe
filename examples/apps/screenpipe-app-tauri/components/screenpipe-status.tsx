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

interface HealthCheckResponse {
  status: string;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  message: string;
  verbose_instructions: string | null;
}

const HealthStatus = ({ className }: { className?: string }) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

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
        verbose_instructions:
          "If you're experiencing issues, please try the following steps:\n\
1. Restart the application.\n\
2. If using a desktop app, reset your Screenpipe OS audio/screen recording permissions.\n\
3. If the problem persists, please contact support with the details of this health check at louis@screenpi.pe.\n\
4. Last, here are some [FAQ](https://github.com/louis030195/screen-pipe/blob/main/content/docs/NOTES.md) with visuals to help you troubleshoot.",
      });
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 1000); // Poll every 1 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logCommands = `# Stream the log:
tail -f $HOME/.screenpipe/screenpipe.log

# Scroll the logs:
less $HOME/.screenpipe/screenpipe.log

# View last 10 frames:
sqlite3 $HOME/.screenpipe/db.sqlite \\
"SELECT * FROM frames ORDER BY timestamp DESC LIMIT 10;"

# View last 10 audio transcriptions:
sqlite3 $HOME/.screenpipe/db.sqlite \\
"SELECT * FROM audio_transcriptions ORDER BY timestamp DESC LIMIT 10;"`;

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await invoke("use_cli", { useCli: true });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchHealth();
    } catch (error) {
      console.error("Failed to stop:", error);
      // Handle error
    } finally {
      setIsStopping(false);
    }
  };
  const handleStart = async () => {
    setIsStarting(true);
    try {
      await invoke("use_cli", { useCli: false });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchHealth();
    } catch (error) {
      console.error("Failed to start:", error);
      // Handle error
    } finally {
      setIsStarting(false);
    }
  };

  if (health && health.status === "Error") {
    return (
      <>
        <style jsx>{`
          @keyframes pulse-custom {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
          .animate-pulse-custom {
            animation: pulse-custom 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
        `}</style>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`w-4 h-4 rounded-full bg-red-500 animate-pulse-custom shadow-lg flex items-center justify-center text-white font-bold ${className}`}
              />
            </TooltipTrigger>
            <TooltipContent className="w-[32em] p-2">
              <h3 className="font-bold mb-2">Error</h3>
              <p className="text-sm">{health.message}</p>
              {health && health.verbose_instructions && (
                <div className="text-xs mt-2 text-red-500">
                  <p className="font-bold mb-1">
                    Troubleshooting Instructions:
                  </p>
                  <MemoizedReactMarkdown className="prose prose-sm">
                    {health.verbose_instructions}
                  </MemoizedReactMarkdown>
                  <p className="font-bold mt-2 text-yellow-500">
                    Instructions not working? Open settings and try CLI mode.
                  </p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setIsDialogOpen(true)}
              >
                View Log Commands
              </Button>
              <span className="text-xs mt-2 text-gray-500">
                ... or restart screenpipe instance
              </span>
              <div className="flex justify-between mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 mr-1"
                  onClick={handleStop}
                  disabled={isStopping || isStarting}
                >
                  {isStopping ? spinner : null}
                  {isStopping ? "Stopping..." : "Stop"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 ml-1"
                  onClick={handleStart}
                  disabled={isStopping || isStarting}
                >
                  {isStarting ? spinner : null}
                  {isStarting ? "Starting..." : "Start"}
                </Button>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Log Commands</DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-auto">
              <CodeBlock language="bash" value={logCommands} />
            </div>
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
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!health) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Healthy":
        return "bg-green-500";
      case "Loading":
        return "bg-yellow-500";
      case "Unhealthy":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    return timestamp ? new Date(timestamp).toLocaleString() : "N/A";
  };

  const blinkingClass =
    isBlinking || health.status === "Unhealthy" ? "animate-pulse" : "";

  return (
    <>
      <style jsx>{`
        @keyframes pulse-custom {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        .animate-pulse-custom {
          animation: pulse-custom 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`w-4 h-4 rounded-full ${getStatusColor(
                health.status
              )} ${blinkingClass} animate-pulse-custom shadow-lg flex items-center justify-center text-white font-bold ${className}`}
            />
          </TooltipTrigger>
          <TooltipContent className="w-[32em] p-2">
            <h3 className="font-bold mb-2">{health.status}</h3>
            <p className="text-sm mb-2">{health.message}</p>
            <p className="text-xs mb-1">Frame: {health.frame_status}</p>
            <p className="text-xs mb-1">Audio: {health.audio_status}</p>
            <p className="text-xs mb-1">
              Last Frame: {formatTimestamp(health.last_frame_timestamp)}
            </p>
            <p className="text-xs mb-1">
              Last Audio: {formatTimestamp(health.last_audio_timestamp)}
            </p>
            {health.verbose_instructions && (
              <div className="text-xs mt-2 text-red-500">
                <p className="font-bold mb-1">Troubleshooting Instructions:</p>
                <MemoizedReactMarkdown className="prose prose-sm">
                  {health.verbose_instructions}
                </MemoizedReactMarkdown>
                <p className="font-bold mt-2 text-yellow-500">
                  Instructions not working? Open settings and try CLI mode.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setIsDialogOpen(true)}
            >
              View Log Commands
            </Button>
            <span className="text-xs mt-2 text-gray-500">
              ... or restart screenpipe instance
            </span>
            <div className="flex justify-between mt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 mr-1"
                onClick={handleStop}
                disabled={isStopping || isStarting}
              >
                {isStopping ? spinner : null}
                {isStopping ? "Stopping..." : "Stop"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 ml-1"
                onClick={handleStart}
                disabled={isStopping || isStarting}
              >
                {isStarting ? spinner : null}
                {isStarting ? "Starting..." : "Start"}
              </Button>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Log Commands</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            <CodeBlock language="bash" value={logCommands} />
          </div>
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
                Ask: &quot;give me 10 sqlite query CLI to look up my data. My db
                is in $HOME/.screenpipe/db.sqlite&quot;
              </li>
            </ol>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthStatus;
