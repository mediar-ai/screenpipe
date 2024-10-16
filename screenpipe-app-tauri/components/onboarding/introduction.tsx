import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "../ui/rainbow-button";
import { ArrowRight } from "lucide-react";

interface OnboardingIntroProps {
  className?: string;
  handleNextSlide: () => void;
}

const OnboardingIntro: React.FC<OnboardingIntroProps> = ({
  className = "",
  handleNextSlide,
}) => (
  <div className={` flex justify-center items-center flex-col ${className}`}>
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
    <RainbowButton className="mt-4" onClick={handleNextSlide}>
      get started
      <ArrowRight className="w-4 h-4 ml-2" />
    </RainbowButton>
  </div>
);

export default OnboardingIntro;
