import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../../ui/rainbow-button";
import { ArrowRight } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/context";

const OnboardingIntro = () => {
  const { skipOnboarding, handleNextSlide } = useOnboarding();
  return (
    <div className={` flex justify-center items-center flex-col`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          where pixels become magic
        </DialogTitle>
        <h2 className="text-center text-sm">
          welcome to screenpipe, excited to have you here
        </h2>
      </DialogHeader>
      <video
        width="600px"
        className="mt-2 rounded-md"
        autoPlay
        controls
        preload="true"
      >
        <source src="/onboarding-screenpipe.mp4" type="video/mp4" />
        your browser does not support the video tag.
      </video>
      <div className="flex gap-4 mt-4">
        <Button
          variant="ghost"
          onClick={async () => await skipOnboarding()}
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
