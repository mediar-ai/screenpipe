import localforage from "localforage";
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingPersonalize from "@/components/onboarding/personalize";
import OnboardingSelection from "@/components/onboarding/select-usecase-options";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingAPISetup from "@/components/onboarding/api-setup";
import OnboardingExperimentalFeatures from "@/components/onboarding/features-experimental";

const setFirstTimeUserFlag = async () => {
  await localforage.setItem("isFirstTimeUser", false);
};

type SlideKey =
  | "intro"
  | "selection"
  | "personalize"
  | "apiSetup"
  | "experimentalFeatures";

const slideFlow: Record<
  SlideKey,
  {
    next: (
      selectedOptions?: string[],
      selectedPersonalization?: string | null
    ) => SlideKey | null;
    prev?: SlideKey;
  }
> = {
  intro: { next: () => "selection" },
  selection: {
    next: (selectedOptions) => {
      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0)
        return null;
      if (selectedOptions.includes("personalUse")) return "personalize";
      if (selectedOptions.includes("professionalUse")) return "apiSetup";
      return "experimentalFeatures";
    },
    prev: "intro",
  },
  personalize: {
    next: (_, selectedPersonalization) =>
      selectedPersonalization === "withAI"
        ? "apiSetup"
        : "experimentalFeatures",
    prev: "selection",
  },
  apiSetup: { next: () => "experimentalFeatures", prev: "selection" },
  experimentalFeatures: { next: () => null, prev: "selection" },
};

const Onboarding: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState<SlideKey>("intro");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedPersonalization, setSelectedPersonalization] = useState< string | null >(null);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, [currentSlide]);

  useEffect(() => {
    if (isOpen) {
      const hideCloseButton = () => {
        const closeButton = document.querySelector(".lucide-x");
        if (closeButton) {
          (closeButton as HTMLElement).classList.add("hidden");
        }
      };
      setTimeout(hideCloseButton, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const checkFirstTimeUser = async () => {
      const isFirstTime = await localforage.getItem<boolean>("isFirstTimeUser");
      if (isFirstTime === null) {
        setIsOpen(true);
      }
    };
    checkFirstTimeUser();
  }, []);

  const handleNextSlide = () => {
    const nextSlide = slideFlow[currentSlide].next(
      selectedOptions,
      selectedPersonalization
    );
    if (currentSlide === "selection" && (!selectedOptions || selectedOptions.length === 0)) {
      setError("Please select at least one option before proceeding!");
      return;
    }
    if (currentSlide === "personalize" && !selectedPersonalization) {
      setError("Please select a personalization option!");
      return;
    }
    if (nextSlide) {
      setIsVisible(false)
      setTimeout(() => {
        setCurrentSlide(nextSlide);
        setError(null);
      }, 300);
    } 
  };

  const getPrevSlide = (): SlideKey | null => {
    switch (currentSlide) {
      case "experimentalFeatures":
        if (selectedOptions.includes("personalUse")) return "personalize";
        if (selectedOptions.includes("professionalUse")) return "apiSetup";
        return "selection";
      case "apiSetup":
        return selectedOptions.includes("personalUse") ? "personalize" : "selection";
      case "personalize":
        return "selection";
      default:
        return slideFlow[currentSlide].prev || null;
    }
  };

  const handlePrevSlide = () => {
    setIsVisible(false);
    setTimeout(() => {
      const prevSlide = getPrevSlide();
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

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen && currentSlide !== "experimentalFeatures") {
      return;
    }
    setIsOpen(isOpen);
  };

  const handleEnd = async () => {
    setIsOpen(false);
    await setFirstTimeUserFlag();
    window.location.reload();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-3xl h-[580px] max-h-[80vh]">
        <div className="relative w-full h-full overflow-hidden">
          {currentSlide === "intro" && (
            <OnboardingIntro 
              className={`transition-opacity duration-300 
              ${isVisible ? 'opacity-100 ease-out' : 'opacity-0 ease-in'}`}
              handleNextSlide={handleNextSlide} 
            />
          )}
          {currentSlide === "selection" && (
            <OnboardingSelection
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? 'opacity-100 ease-out' : 'opacity-0 ease-in'}`}
              handleOptionClick={handleOptionClick}
              selectedOptions={selectedOptions}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
              error={error}
            />
          )}
          {currentSlide === "personalize" && (
            <OnboardingPersonalize
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? 'opacity-100 ease-out' : 'opacity-0 ease-in'}`}
              handleOptionClick={setSelectedPersonalization}
              selectedPersonalization={selectedPersonalization}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
              error={error}
            />
          )}
          {currentSlide === "apiSetup" && (
            <OnboardingAPISetup
              className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? 'opacity-100 ease-out' : 'opacity-0 ease-in'}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "experimentalFeatures" && (
            <OnboardingExperimentalFeatures
              className={`transition-opacity duration-300 
              ${isVisible ? 'opacity-100' : 'opacity-0'}`}
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

