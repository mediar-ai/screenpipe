{
  /*TODO: setup screenpipe status  <10-10-24, @tribhuwan-kumar>*/
}

import React, { useState, useEffect } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { spinner } from "@/components/spinner";
import { Command } from "@tauri-apps/plugin-shell";
import { Separator } from "../ui/separator";

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

  useEffect(() => {
    let isMounted = true;
    let child: Awaited<ReturnType<Command<any>["spawn"]>> | null = null;

    const checkStatus = async () => {
      try {
        const command = Command.sidecar("screenpipe", ["setup"]);

        const timeoutPromise = new Promise(
          (_, reject) =>
            setTimeout(
              () => reject(new Error("Status check timed out")),
              900000
            ) // 15 minutes
        );

        const outputPromise = new Promise<string>((resolve, reject) => {
          command.on("close", (data) => {
            if (data.code !== 0) {
              reject(new Error(`Command failed with code ${data.code}`));
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

        child = await command.spawn();

        try {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // add 2s delay for fast connections
          const result = await Promise.race([outputPromise, timeoutPromise]);
          if (isMounted) {
            setStatus(result as string);
          }
        } catch (error) {
          console.error("Error or timeout:", error);
          if (isMounted) {
            setStatus("error");
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
        if (isMounted) {
          setStatus("error");
        }
      }
    };

    checkStatus();

    return () => {
      isMounted = false;
      if (child) {
        child.kill().catch(console.error);
      }
    };
  }, []);

  const handleNext = () => {
    setStatus(null);
    handleNextSlide();
  };

  const handlePrev = () => {
    setStatus(null);
    handlePrevSlide();
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
      <div className="my-8" />
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
      {status === null ? (
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
          className="size-5 animate-spin stroke-zinc-400 mx-auto mt-4"
        >
          <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"></path>
        </svg>
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
