import localforage from "localforage";
import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingStatus from "@/components/onboarding/status";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingAPISetup from "@/components/onboarding/api-setup";
import OnboardingInstructions from "@/components/onboarding/explain-instructions";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useSettings } from "@/lib/hooks/use-settings";
import OnboardingLogin from "./onboarding/login";
import posthog from "posthog-js";

type SlideKey =
  | "intro"
  | "status" 
  | "login"
  | "apiSetup"
  | "instructions";

// Simplified flow - linear progression
const getNextSlide = (currentSlide: SlideKey): SlideKey | null => {
  switch (currentSlide) {
    case "intro":
      return "status";
    case "status":
      return "login";
    case "login":
      return "apiSetup";
    case "apiSetup":
      return "instructions";
    case "instructions":
      return null;
    default:
      return null;
  }
};

const getPrevSlide = (currentSlide: SlideKey): SlideKey | null => {
  switch (currentSlide) {
    case "intro":
      return null;
    case "status":
      return "intro";
    case "login":
      return "status";
    case "apiSetup":
      return "login";
    case "instructions":
      return "apiSetup";
    default:
      return null;
  }
};

const trackOnboardingStep = (
  step: SlideKey | "completed",
  properties?: Record<string, any>
) => {
  posthog.capture("onboarding_step", {
    step,
    ...properties,
  });
};

const Onboarding: React.FC = () => {
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState<SlideKey>("intro");
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [visitedSlides, setVisitedSlides] = useState<SlideKey[]>(["intro"]);
  const { showOnboarding, setShowOnboarding } = useOnboarding();

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
        title: "Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleNextSlide = () => {
    const nextSlide = getNextSlide(currentSlide);

    trackOnboardingStep(currentSlide, {
      direction: "next",
    });

    if (nextSlide) {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentSlide(nextSlide);
        setVisitedSlides(prev => [...prev, nextSlide]);
        setError(null);
      }, 300);
    } else {
      handleEnd();
    }
  };

  const handlePrevSlide = () => {
    setIsVisible(false);

    trackOnboardingStep(currentSlide, {
      direction: "back",
    });

    setTimeout(() => {
      let prevSlide = getPrevSlide(currentSlide);
      
      if (prevSlide) {
        setError(null);
        setCurrentSlide(prevSlide);
      }
    }, 300);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && currentSlide) {
      setShowOnboarding(open);
    }
  };

  const handleEnd = async () => {
    trackOnboardingStep("completed");

    // Save user preferences
    await localforage.setItem("user_preferences", {
      completedAt: new Date().toISOString(),
    });

    // This will automatically set onboarding_completed to true
    setShowOnboarding(false);
  };

  return (
    <Dialog open={showOnboarding} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-5xl min-w-[1000px] min-h-[640px] max-h-[calc(100vh-100px)] overflow-hidden">
        <div className="flex flex-col w-full h-full overflow-hidden">
          {currentSlide === "intro" && (
            <OnboardingIntro
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "status" && (
            <OnboardingStatus
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "login" && (
            <OnboardingLogin
              className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "apiSetup" && (
            <OnboardingAPISetup
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
              handleNextSlide={handleEnd}
              handlePrevSlide={handlePrevSlide}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;
