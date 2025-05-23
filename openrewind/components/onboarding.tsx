import localforage from "localforage";
import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingPipes from "@/components/onboarding/pipes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingStatus from "@/components/onboarding/status";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingAPISetup from "@/components/onboarding/api-setup";
import OnboardingPersonalize from "@/components/onboarding/personalize";
import OnboardingDevOrNonDev from "@/components/onboarding/dev-or-non-dev";
import OnboardingDevConfig from "@/components/onboarding/dev-configuration";
import OnboardingSelection from "@/components/onboarding/usecases-selection";
import OnboardingInstructions from "@/components/onboarding/explain-instructions";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useSettings } from "@/lib/hooks/use-settings";
import OnboardingLogin from "./onboarding/login";
import OnboardingPipeStore from "./onboarding/pipe-store";
import posthog from "posthog-js";

type SlideKey =
  | "intro"
  | "status"
  | "login"
  | "selection"
  | "personalize"
  | "apiSetup"
  | "devOrNonDev"
  | "devConfig"
  | "pipes"
  | "pipeStore"
  | "instructions";

const slideFlow: Record<
  SlideKey,
  {
    next: (
      selectedOptions?: string[],
      selectedPreference?: string | null,
      selectedPersonalization?: string | null
    ) => SlideKey | null;
    prev: (
      selectedOptions?: string[],
      selectedPreference?: string | null,
      selectedPersonalization?: string | null
    ) => SlideKey | null;
  }
> = {
  intro: {
    // introduction video of screenpipe
    next: () => "status",
    prev: () => null,
  },
  status: {
    // status of screenpipe (blockage or not)
    next: () => "login",
    prev: () => "intro",
  },
  login: {
    // login
    next: () => "apiSetup",
    prev: () => "status",
  },
  selection: {
    // selection (four options)
    next: (selectedOptions) => {
      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0)
        return null;
      return "devOrNonDev";
    },
    prev: () => "status",
  },
  personalize: {
    // personalize (with ai or without ai)
    next: (selectedOptions, __, selectedPersonalization) => {
      if (selectedPersonalization === "withAI") return "apiSetup";
      if (
        selectedOptions?.includes("personalUse") &&
        selectedPersonalization === "withoutAI"
      )
        return "instructions";
      return "instructions";
    },
    prev: () => "selection",
  },
  apiSetup: {
    // api setup & validation
    next: () => "pipeStore",
    prev: () => "login",
  },
  pipeStore: {
    // pipe store
    next: () => null,
    prev: () => "apiSetup",
  },
  devOrNonDev: {
    // dev or no dev
    next: (selectedOptions, selectedPreference, selectedPersonalization) => {
      if (
        selectedOptions?.includes("personalUse") &&
        selectedPersonalization === "withoutAI" &&
        selectedPreference === "nonDevMode"
      )
        return "instructions";
      if (selectedPreference === "devMode") return "devConfig";
      return "personalize";
    },
    prev: () => "selection",
  },
  devConfig: {
    // dev configuration
    next: () => "pipes",
    prev: () => "devOrNonDev",
  },
  pipes: {
    // explain about pipes to dev
    next: () => "instructions",
    prev: () => "devConfig",
  },
  instructions: {
    // instructions for every type of user
    next: () => null,
    prev: (selectedOptions, selectedPreference, selectedPersonalization) => {
      if (selectedPreference === "devMode") return "pipes";
      if (selectedOptions?.includes("personalUse")) return "personalize";
      if (selectedOptions?.includes("professionalUse")) return "personalize";
      if (selectedOptions?.includes("developmentlUse")) return "personalize";
      if (selectedPersonalization === "withAI") return "apiSetup";
      return "devOrNonDev";
    },
  },
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
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); // use case selection (four options)
  const [selectedPersonalization, setSelectedPersonalization] = useState<
    string | null
  >(null); // with ai or without ai
  const [selectedPreference, setSelectedPreference] = useState<string | null>(
    null
  ); // dev or non dev
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
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

  const handleOptionClick = (option: string) => {
    setSelectedOptions((prevOptions) =>
      prevOptions.includes(option)
        ? prevOptions.filter((opt) => opt !== option)
        : [...prevOptions, option]
    );
    setError(null);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && currentSlide) {
      setShowOnboarding(open);
    }
  };

  const handleEnd = async () => {
    trackOnboardingStep("completed", {
      finalOptions: selectedOptions,
      finalPreference: selectedPreference,
      finalPersonalization: selectedPersonalization,
    });

    setShowOnboarding(false);
  };

  return (
    <Dialog open={showOnboarding} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-4xl h-[640px] max-h-[100vh]">
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
          {currentSlide === "selection" && (
            <OnboardingSelection
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleOptionClick={handleOptionClick}
              selectedOptions={selectedOptions}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "personalize" && (
            <OnboardingPersonalize
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleOptionClick={setSelectedPersonalization}
              selectedPersonalization={selectedPersonalization}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
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
          {currentSlide === "pipeStore" && (
            <OnboardingPipeStore
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleEnd}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "devOrNonDev" && (
            <OnboardingDevOrNonDev
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleOptionClick={setSelectedPreference}
              selectedPreference={selectedPreference}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "devConfig" && (
            <OnboardingDevConfig
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "pipes" && (
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
