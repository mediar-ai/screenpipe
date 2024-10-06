import localforage from "localforage";
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingPersonalize from "@/components/onboarding/personalize";
import OnboardingSelection from "@/components/onboarding/select-usecase-options";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingAPISetup from "@/components/onboarding/api-setup";
import OnboardingExperimentalFeatures from "@/components/onboarding/features-experimental";

const checkFirstTimeUser = async () => {
  const isFirstTime = await localforage.getItem<boolean>("isFirstTimeUser");
  return isFirstTime === null;
};

const setFirstTimeUserFlag = async () => {
  await localforage.setItem("isFirstTimeUser", false);
};

const Onboarding: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedPersonalization, setSelectedPersonalization] = useState<string | null>(null);
  const [animationDirection, setAnimationDirection] = useState("right");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkFirstTime = async () => {
      const isFirstTime = await checkFirstTimeUser();
      if (isFirstTime) {
        setIsOpen(true);
      }
    };
    checkFirstTime();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const hideCloseButton = () => {
        const closeButton = document.querySelector(".lucide-x");
        if (closeButton) {
          console.log("button", closeButton);
          (closeButton as HTMLElement).classList.add('hidden');
        }
      }
      setTimeout(hideCloseButton, 100)
    };
  }, [isOpen]);

  const handleOptionClick = (option: string) => {
    setSelectedOptions((prevOptions) =>
      prevOptions?.includes(option)
      ? prevOptions?.filter((opt) => opt !== option)
      : [...prevOptions, option]
    ); 
    setSelectedPersonalization(option);
    setError(null);
  };

  const handleNextSlide = () => {
    if (currentSlide === 0 || selectedOptions.length > 0) {
      setAnimationDirection("right");
      setCurrentSlide((prevSlide) => prevSlide + 1);
    } else {
      setError("Please select at least one option before proceeding!");
    }
  };

  const handlePrevSlide = () => {
    setAnimationDirection("left");
    setCurrentSlide((prevSlide) => Math.max(prevSlide - 1, 0));
  };

  const handleEnd = async () => {
    setIsOpen(false);
    await setFirstTimeUserFlag();
    window.location.reload();
  };

  const getSlideClass = (slideIndex: number) => {
    if (slideIndex === currentSlide) {
      return "translate-x-0"; 
    }
    if (slideIndex < currentSlide) {
      return animationDirection === "right" ? "-translate-x-full" : "translate-x-full";
    }
    return animationDirection === "right" ? "translate-x-full" : "-translate-x-full"; 
  };

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen && currentSlide < 3) {
      return;
    }
    setIsOpen(isOpen);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-3xl h-[70vh] max-h-[80vh] onboarding-dialog">
        <div className="relative w-full h-full transition-transform duration-500 ease-in-outoverflow-hidden">
          {/* slide first = introduction */}
          {currentSlide === 0 && (
            <OnboardingIntro handleNextSlide={handleNextSlide} />
          )}
          {/* slide second = select Options */}
          {currentSlide === 1 && (          
            <OnboardingSelection
              handleOptionClick={handleOptionClick}
              selectedOptions={selectedOptions}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
              error={error}
            />
          )}
          {/* slide thrid = if user is selection includes "personalUse" */}
          {currentSlide === 2 && selectedOptions.includes("personalUse") && (
            <div className="flex h-[80%] flex-col">
              <OnboardingPersonalize
                className=""
                handleOptionClick={handleOptionClick}
                selectedPersonalization={selectedPersonalization}
                handlePrevSlide={handlePrevSlide}
                handleNextSlide={handleNextSlide}
              />
            </div>
          )}
          {/* slide thrid = if user selections includes "professionalUse" */}
          {currentSlide === 2 && selectedOptions.includes("professionalUse") && (
            <div className="flex h-[80%] flex-col">
              <OnboardingAPISetup
                handleNextSlide={handleNextSlide}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
          {currentSlide === 3 && selectedOptions.includes("professionalUse") && (
            <div className="flex h-[80%] flex-col">
              <OnboardingExperimentalFeatures 
                className=""
                handleNextSlide={handleEnd}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
          {currentSlide === 2 && selectedOptions.includes("developmentlUse") && (
            <div className="flex h-[80%] flex-col">
              <OnboardingExperimentalFeatures 
                className=""
                handleNextSlide={handleEnd}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )} 
          {currentSlide === 2 && selectedOptions.includes("otherUse") && (
            <div className="flex h-[80%] flex-col">
              <OnboardingExperimentalFeatures 
                className=""
                handleNextSlide={handleEnd}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
          {/* slide fourth = if user is selects "withAI" in personalize slide */}
          {currentSlide === 3 && selectedPersonalization === "withAI" && (
            <div className="flex h-[80%] flex-col">
              <OnboardingAPISetup
                handleNextSlide={handleNextSlide}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
          {/* slide fourth = if user is selects "withoutAI" in personalize slide */}
          {currentSlide === 3 && selectedPersonalization === "withoutAI" && (
            <div className="flex h-[80%] flex-col">
              <OnboardingExperimentalFeatures 
                handleNextSlide={handleEnd}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
          {/* slide fifth = if user is selects "withAI" in personalize slide and setups api key in api setup slide */}
          {currentSlide === 4 && selectedPersonalization === "withAI" && (
            <div className="flex h-[80%] flex-col">
              <OnboardingExperimentalFeatures 
                className=""
                handleNextSlide={handleEnd}
                handlePrevSlide={handlePrevSlide}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;

