import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TextSearch, BotMessageSquare } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";

interface OnboardingPersonalizeProps {
  error: string | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
  selectedPersonalization?: string | null;
  className?: string;
}

const OnboardingPersonalize: React.FC<OnboardingPersonalizeProps> = ({
  className = "",
  selectedPersonalization = "",
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
  error,
}) => {
  return (
    <div className={`${className} w-full flex justify-center flex-col relative`}>
      <DialogHeader className="mt-1 px-2">
        <div className="w-full !mt-[-10px] inline-flex justify-center">
          <img
            src="/128x128.png"
            alt="screenpipe-logo"
            width="72"
            height="72"
          />
        </div>
        <DialogTitle className="text-center font-bold text-[32px] text-balance flex justify-center">
          Personalize your Screepipe
        </DialogTitle>
        <p className="text-center text-lg ">
          How would you like to use Screenpipe ?
        </p>
      </DialogHeader>
      <div className="flex w-full justify-around mt-6">
        <Card
          className={` p-4 h-[250px] hover:bg-accent ${
            selectedPersonalization === "withoutAI" ? "bg-accent" : ""
          }`}
          onClick={() => handleOptionClick("withoutAI")}
        >
          <CardContent className="flex flex-col w-[250px] justify-center cursor-pointer">
            <TextSearch className="w-16 h-16 mr-auto ml-auto" />
            <h2 className="font-semibold text-xl">Conventional Search</h2>
            <span className="prose prose-sm">
              Seamless functionality, Easily monitor screen and audio with
              built-in OCR for precise scanning.
            </span>
            <span className="text-muted-foreground text-center prose-sm mt-2">
              No API key needed.
            </span>
          </CardContent>
        </Card>
        <Card
          className={` p-4 h-[250px] hover:bg-accent ${
            selectedPersonalization === "withAI" ? "bg-accent" : ""
          }`}
          onClick={() => handleOptionClick("withAI")}
        >
          <CardContent className="flex flex-col w-[250px] justify-center cursor-pointer">
            <BotMessageSquare className="w-16 h-16 mr-auto ml-auto" />
            <h2 className="font-semibold text-xl">AI-Enhanced Search</h2>
            <span className="prose prose-sm">
              Leverage AI capabilities and seamlessly monitor your screen, using
              advanced AI to summarize collected data
            </span>
            <span className="text-muted-foreground text-center prose-sm mt-2">
              API key required.
            </span>
          </CardContent>
        </Card>
        {error && <div className="text-destructive text-center bottom-10 absolute mt-3">{error}</div>}
      </div>
      <OnboardingNavigation
        className="mt-8"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="Previous"
        nextBtnText="Next"
      />
    </div>
  );
};

export default OnboardingPersonalize;

