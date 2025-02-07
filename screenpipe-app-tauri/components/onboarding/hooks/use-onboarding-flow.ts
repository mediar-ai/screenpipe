import { useEffect, useState } from "react";
import { SlideKey, slideFlow, trackOnboardingStep } from "../flow";
import localforage from "localforage";

export function useOnboardingFlow(
  selectedOptions: string[],
  selectedPreference: string | null,
  selectedPersonalization: string | null,
) {
  const [currentSlide, setCurrentSlide] = useState<SlideKey>(SlideKey.INTRO);

  useEffect(() => {
    const checkScreenPermissionRestartPending = async () => {
      const screenPermissionRestartPending = await localforage.getItem("screenPermissionRestartPending");

      if (screenPermissionRestartPending === true) {
        setCurrentSlide(SlideKey.STATUS);
      }
    };
    checkScreenPermissionRestartPending();
  }, []);

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

  const setRestartPending = async () => {
    await localforage.setItem("screenPermissionRestartPending", true);
  };

  return {
    currentSlide,
    error,
    handleNextSlide,
    handlePrevSlide,
    setRestartPending,
  };
}