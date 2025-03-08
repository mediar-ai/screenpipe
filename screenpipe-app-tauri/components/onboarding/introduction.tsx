import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../ui/rainbow-button";
import { ArrowRight } from "lucide-react";
import { useSettings } from "@/lib/hooks/use-settings";
import posthog from "posthog-js";
import { useOnboarding } from "@/lib/hooks/use-onboarding";

interface OnboardingIntroProps {
  className?: string;
  handleNextSlide: () => void;
}

const OnboardingIntro: React.FC<OnboardingIntroProps> = ({
  className = "",
  handleNextSlide,
}) => {
  const { setShowOnboarding } = useOnboarding();
  const handleSkip = () => {
    setShowOnboarding(false);
    posthog.capture("onboarding_skipped");
  };

  return (
    <div className={` flex justify-center items-center flex-col ${className}`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          screenpipe
        </DialogTitle>
      </DialogHeader>
      <iframe
        width="600"
        height="338"
        className="mt-2 rounded-md"
        src="https://www.youtube.com/embed/2963sr3IPHY"
        title="screenpipe introduction"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
      <div className="flex gap-4 mt-4">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          skip onboarding
        </Button>
        <RainbowButton onClick={handleNextSlide}>
          get started
          <ArrowRight className="w-4 h-4 ml-2" />
        </RainbowButton>
      </div>
    </div>
  );
};

export default OnboardingIntro;
