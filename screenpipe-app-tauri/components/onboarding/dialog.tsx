import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingPipes from "@/components/onboarding/slides/pipes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingStatus from "@/components/onboarding/slides/status";
import OnboardingIntro from "@/components/onboarding/slides/introduction";
import OnboardingAPISetup from "@/components/onboarding/slides/api-setup";
import OnboardingPersonalize from "@/components/onboarding/slides/personalize";
import OnboardingDevOrNonDev from "@/components/onboarding/slides/dev-or-non-dev";
import OnboardingDevConfig from "@/components/onboarding/slides/dev-configuration";
import OnboardingSelection from "@/components/onboarding/slides/usecases-selection";
import OnboardingInstructions from "@/components/onboarding/slides/explain-instructions";
import { useOnboarding } from "@/components/onboarding/context";
import OnboardingLogin from "./slides/login";
import OnboardingPipeStore from "./slides/pipe-store";
import { SlideKey } from "./flow";

const SlidesPerKey: Record<SlideKey, () => React.JSX.Element> = {
  [SlideKey.INTRO]: () => <OnboardingIntro/>,
  [SlideKey.STATUS]: () => <OnboardingStatus/>,
  [SlideKey.LOGIN]: () => <OnboardingLogin/>,
  [SlideKey.SELECTION]: () => <OnboardingSelection/>,
  [SlideKey.PERSONALIZE]: () => <OnboardingPersonalize/>,
  [SlideKey.API_SETUP]: () => <OnboardingAPISetup/>,
  [SlideKey.PIPE_STORE]: () => <OnboardingPipeStore/>,
  [SlideKey.DEV_OR_NON_DEV]: () => <OnboardingDevOrNonDev/>,
  [SlideKey.DEV_CONFIG]: () => <OnboardingDevConfig/>,
  [SlideKey.PIPES]: () => <OnboardingPipes/>,
  [SlideKey.INSTRUCTIONS]: () => <OnboardingInstructions/>,
}

{/* <OnboardingIntro
  className={`transition-opacity duration-300 
  ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
  /> */}

const Onboarding: React.FC = () => {
  const { showOnboarding, currentSlide, error } = useOnboarding();
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsVisible(true);
  }, [currentSlide]);

  useEffect(() => {
    if (showOnboarding) {
      const hideCloseButton = () => {
        const closeButton = document.querySelector(".lucide-x");
        if (closeButton) {
          (closeButton as HTMLElement).classList.add("hidden");
        }
      };
      setTimeout(hideCloseButton, 100);
    }
  }, [showOnboarding]);

  useEffect(() => {
    if (error) {
      toast({
        title: "error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <Dialog open={showOnboarding} onOpenChange={(t) => console.log({t})}>
      <DialogContent className="max-w-4xl h-[640px] max-h-[100vh]">
        <div key={currentSlide} className="flex flex-col w-full h-full overflow-hidden">
          {SlidesPerKey[currentSlide]()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;
