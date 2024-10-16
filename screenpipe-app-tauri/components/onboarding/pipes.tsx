import React from "react";
import { CodeBlock } from "@/components/onboarding/single-codeblock";
import { ArrowUpRight } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { open } from "@tauri-apps/plugin-shell";

interface OnboardingPipesProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingPipes: React.FC<OnboardingPipesProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  return (
    <div className={`${className} w-full flex justify-center flex-col`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          screenpipe tips
        </DialogTitle>
      </DialogHeader>
      <div className="mt-32 w-full flex justify-around flex-col text-center">
        <div className="mx-3">
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              screenpipe is built to be fully extensible,
            </span>
            allowing you to enhance its capabilities with custom pipes,
            versatile plugins that streamline workflow automation for analyzing,
            managing your captured data.
          </p>
          <p className="mt-4 text-muted-foreground text-[14px]">
            we offer bounties for pipes or make it easy for you to monetize it
            through Stripe & our pipe store!
          </p>
        </div>

        <a
          onClick={() =>
            open(
              "https://docs.screenpi.pe/docs/plugins#quick-tour---developing-pipes-in-screenpipe"
            )
          }
          href="#"
          className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline"
        >
          checkout our docs for creating your own pipe!
          <ArrowUpRight className="inline w-4 h-4 ml-1 " />
        </a>
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

export default OnboardingPipes;
