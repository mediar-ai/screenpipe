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
import { slideFlow, SlideKey, trackOnboardingStep } from "./flow";

const Onboarding: React.FC = () => {
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState<SlideKey>(SlideKey.INTRO);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { showOnboarding } = useOnboarding();

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

  const handleNextSlide = () => {
    const nextSlide = slideFlow[currentSlide].next(
      selectedOptions,
      selectedPreference,
      selectedPersonalization
    );

    trackOnboardingStep(currentSlide, {
      selectedOptions,
      selectedPreference,
      selectedPersonalization,
      direction: "next",
    });

    if (
      currentSlide === "selection" &&
      (!selectedOptions || selectedOptions.length === 0)
    ) {
      setError("please select at least one option before proceeding!");
      return;
    }
    if (currentSlide === "personalize" && !selectedPersonalization) {
      setError("please choose a personalization option!");
      return;
    }
    if (currentSlide === "devOrNonDev" && !selectedPreference) {
      setError("please choose a preference option!");
      return;
    }
    if (nextSlide) {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentSlide(nextSlide);
        setError(null);
      }, 300);
    } else {
      setError("Please validate selection");
    }
  };

  const handlePrevSlide = () => {
    setIsVisible(false);

    trackOnboardingStep(currentSlide, {
      selectedOptions,
      selectedPreference,
      selectedPersonalization,
      direction: "back",
    });

    setTimeout(() => {
      const prevSlide = slideFlow[currentSlide].prev(
        selectedOptions,
        selectedPreference,
        selectedPersonalization
      );
      if (prevSlide) {
        setError(null);
        setCurrentSlide(prevSlide);
      }
    }, 300);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && currentSlide) {
      // setShowOnboarding(open);
    }
  };

  return (
    <Dialog open={showOnboarding} onOpenChange={(t) => console.log({t})}>
      <DialogContent className="max-w-4xl h-[640px] max-h-[100vh]">
        <div className="flex flex-col w-full h-full overflow-hidden">
          {currentSlide === "intro" && (
            <OnboardingIntro
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === SlideKey.STATUS && (
            <OnboardingStatus
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === SlideKey.LOGIN && (
            <OnboardingLogin
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === SlideKey.SELECTION && (
            <OnboardingSelection
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === SlideKey.PERSONALIZE && (
            <OnboardingPersonalize
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === SlideKey.API_SETUP && (
            <OnboardingAPISetup
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === SlideKey.PIPE_STORE && (
            <OnboardingPipeStore
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === SlideKey.DEV_OR_NON_DEV && (
            <OnboardingDevOrNonDev
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === SlideKey.DEV_CONFIG && (
            <OnboardingDevConfig
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === SlideKey.PIPES && (
            <OnboardingPipes
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "instructions" && (
            <OnboardingInstructions
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;
