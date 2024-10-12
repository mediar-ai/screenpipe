import React from "react";
import { HelpCircle, Info } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OnboardingInstructionsProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingInstructions: React.FC<OnboardingInstructionsProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  return (
    <div className={`${className} w-full flex justify-center flex-col`}>
      <DialogHeader className="px-2">
        <div className="w-full inline-flex !mt-[-10px] justify-center">
          <img
            src="/128x128.png"
            alt="screenpipe-logo"
            width="72"
            height="72"
          />
        </div>
        <DialogTitle className="text-center !mt-[-3px] font-bold text-[30px] text-balance flex justify-center">
          screenpipe usage instructions
        </DialogTitle>
        <h1 className="text-center !mt-[-1px] text-lg">
          before we begin, learn how to use screenpipe effectively!
        </h1>
      </DialogHeader>
      <div className="flex justify-center">
        <div className="h-[1px] w-40 rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
        <div className="h-[1px] w-40 rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
      </div>
      <div className="mt-2 w-full flex justify-around flex-col">
        <div className="mx-4 mb-2">
          <h2 className="font-semibold text-md">search functionality:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              on screenpipe&apos;s main menu,
            </span>
            you&apos;ll find a search bar to query the 24/7 captured data. it
            lets you select specific results for ai summarization and chatting,
            providing valuable insights.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4 mb-2">
          <h2 className="font-medium text-md">status menu:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              screenpipe status menu serves
            </span>
            as a health and process monitor and allows you to adjust advanced
            preferences for backend processes
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4 mb-2">
          <h2 className="font-medium text-md">settings menu:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              the settings menu,
            </span>
            is where you can configure various options like monitor recorder
            settings and ai preferences. this section lets you customize how
            screenpipe interacts with llms
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-40 rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-40 rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4">
          <h2 className="font-medium text-md">
            meetings tracking (experimental):
          </h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              this features of screenpipe
            </span>
            tracks your meetings by analyzing specific keywords and generates
            summaries for you using ai &amp; llms .
          </p>
        </div>
        <div className="mx-4">
          <h2 className="font-medium text-md">pipe store (experimental):</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              this features of screenpipe
            </span>
            extend your 24/7 data through plugins you can install in seconds,
            create, share and sell your own.
          </p>
        </div>
      </div>

      <OnboardingNavigation
        className="mt-8"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </div>
  );
};

export default OnboardingInstructions;
