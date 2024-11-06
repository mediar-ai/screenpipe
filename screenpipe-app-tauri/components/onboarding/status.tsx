{
  /*TODO: setup screenpipe status  <10-10-24, @tribhuwan-kumar>*/
}

import React, { useState } from "react";
import { ArrowUpRight, Check, HelpCircle } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { Command } from "@tauri-apps/plugin-shell";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { useSettings } from "@/lib/hooks/use-settings";
import { Label } from "../ui/label";
import { trackError } from "@/lib/opentelemetry";

interface OnboardingStatusProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useChineseMirror, setUseChineseMirror] = useState(false);
  const { updateSettings } = useSettings();

  const startSetup = async () => {
    setIsLoading(true);
    setStatus(null);

    try {
      const command = Command.sidecar("screenpipe", ["setup"]);

      const timeoutPromise = new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("status check timed out")), 900000) // 15 minutes
      );

      const outputPromise = new Promise<string>((resolve, reject) => {
        command.on("close", (data) => {
          if (data.code !== 0) {
            reject(new Error(`command failed with code ${data.code}`));
          }
        });
        command.on("error", (error) => reject(new Error(error)));
        command.stdout.on("data", (line) => {
          console.log(line);
          if (line.includes("screenpipe setup complete")) {
            resolve("ok");
          }
        });
      });

      const child = await command.spawn();

      try {
        const result = await Promise.race([outputPromise, timeoutPromise]);
        setStatus(result as string);
      } catch (error) {
        console.error("error or timeout:", error);
        setStatus("error");
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("error checking status:", error);
      setStatus("error");
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    setStatus(null);
    handleNextSlide();
  };

  const handlePrev = () => {
    setStatus(null);
    handlePrevSlide();
  };

  const handleChineseMirrorToggle = async (checked: boolean) => {
    setUseChineseMirror(checked);
    updateSettings({ useChineseMirror: checked });
  };

  const runSetup = async () => {
    setIsLoading(true);
    setStatus(null);

    try {
      const command = Command.sidecar("screenpipe", ["setup"]);

      const timeoutPromise = new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("setup timed out")), 900000) // 15 minutes
      );

      const outputPromise = new Promise<string>((resolve, reject) => {
        command.on("close", (data) => {
          if (data.code !== 0) {
            reject(new Error(`command failed with code ${data.code}`));
          }
        });
        command.on("error", (error) => reject(new Error(error)));
        command.stdout.on("data", (line) => {
          console.log(line);
          if (line.includes("screenpipe setup complete")) {
            resolve("ok");
          }
        });
      });

      const child = await command.spawn();

      try {
        const result = await Promise.race([outputPromise, timeoutPromise]);
        setStatus(result as string);
      } catch (error) {
        console.error("error or timeout:", error);
        setStatus("error");
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("error checking status:", error);
      setStatus("error");
      setIsLoading(false);
      trackError(error, {
        operation: "screenpipe-setup-failure",
        additionalAttributes: {
          useChineseMirror: String(useChineseMirror),
        },
      });
    }
  };

  return (
    <div
      className={`${className} w-full flex justify-between flex-col items-center`}
    >
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          setting up screenpipe
        </DialogTitle>
        <h2 className="text-center text-sm">
          we need to download some ai models for you.
          <br />
          this may take a few minutes depending on your internet connection
        </h2>
      </DialogHeader>
      <div className="mt-4 text-sm text-zinc-600 mx-auto">
        <p className="mb-2 text-center">how screenpipe works:</p>
        <ul className="list-disc list-inside text-left">
          <li>core recording process runs in the background</li>
          <li>gui interface for easy interaction</li>
          <li>can also be used as a standalone cli tool</li>
          <li>captures screens & mics 24/7</li>
          <li>extracts text (ocr) & speech-to-text</li>
          <li>saves data locally for privacy</li>
        </ul>
      </div>

      <p className="text-xs text-center text-zinc-500 mt-2">
        if encountering any issues, you can proceed to the next step and it will
        setup screenpipe when starting the recording process
      </p>
      <div className="flex items-center space-x-2 mt-4">
        <Switch
          id="chinese-mirror-toggle"
          checked={useChineseMirror}
          onCheckedChange={handleChineseMirrorToggle}
        />
        <Label
          htmlFor="chinese-mirror-toggle"
          className="flex items-center space-x-2"
        >
          <span>use chinese mirror for model downloads</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  enable this option to use a chinese mirror for
                  <br />
                  downloading hugging face models
                  <br />
                  (e.g. whisper, embedded llama, etc.)
                  <br />
                  which are blocked in mainland china.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
      </div>
      {status === null ? (
        <Button onClick={startSetup} disabled={isLoading} className="mt-4">
          {isLoading ? (
            <svg
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              xmlns="http://www.w3.org/2000/svg"
              className="size-5 animate-spin stroke-zinc-400 mr-2"
            >
              <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"></path>
            </svg>
          ) : null}
          {isLoading ? "setting up..." : "start setup"}
        </Button>
      ) : status === "ok" ? (
        <div className="flex flex-col items-center mt-4">
          <Check className="size-5 stroke-zinc-400" />
          <p className="text-sm text-zinc-600 mt-2">
            screenpipe setup complete. ai models downloaded.
          </p>
        </div>
      ) : (
        <p className="text-center mt-4">{status}</p>
      )}
      <OnboardingNavigation
        handlePrevSlide={handlePrev}
        handleNextSlide={handleNext}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </div>
  );
};

export default OnboardingStatus;
