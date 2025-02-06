import { useState } from "react";
import { SlideKey, slideFlow, trackOnboardingStep } from "../flow";
import posthog from "posthog-js";

export function useOnboardingFlow(
  selectedOptions: string[],
  selectedPreference: string | null,
  selectedPersonalization: string | null,
  setShowOnboardingToFalse: () => void
) {
  const [currentSlide, setCurrentSlide] = useState<SlideKey>(SlideKey.INTRO);
  const [error, setError] = useState<string | null>(null);

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
      setTimeout(() => {
        setCurrentSlide(nextSlide);
        setError(null);
      }, 300);
    } else {
      setError("Please validate selection");
    }
  };

  const handlePrevSlide = () => {
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


  function skipOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_skipped");
  }

  function completeOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_completed");
  }

  async function handleEnd() {
    trackOnboardingStep("completed", {
      finalOptions: selectedOptions,
      finalPreference: selectedPreference,
      finalPersonalization: selectedPersonalization,
    });

    setShowOnboardingToFalse();
  };
  
  return {
    currentSlide,
    error,
    handleNextSlide,
    handlePrevSlide,
    handleDialogClose,
    skipOnboarding,
    completeOnboarding,
    handleEnd,
  };
}