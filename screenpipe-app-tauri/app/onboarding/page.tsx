"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingStatus from "@/components/onboarding/status";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingSelection from "@/components/onboarding/usecases-selection";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import posthog from "posthog-js";
import { commands } from "@/lib/utils/tauri";

type SlideKey = "intro" | "usecases" | "status";

// Window size configurations for each slide - consistent size to avoid resizing issues
const SLIDE_WINDOW_SIZES: Record<SlideKey, { width: number; height: number }> = {
  intro: { width: 900, height: 800 },
  usecases: { width: 900, height: 800 },
  status: { width: 900, height: 800 },
};

// 3-step flow: intro → usecases → status → done
const getNextSlide = (currentSlide: SlideKey): SlideKey | null => {
  switch (currentSlide) {
    case "intro":
      return "usecases";
    case "usecases":
      return "status";
    case "status":
      return null; // Complete onboarding
    default:
      return null;
  }
};

const getPrevSlide = (currentSlide: SlideKey): SlideKey | null => {
  switch (currentSlide) {
    case "intro":
      return null;
    case "usecases":
      return "intro";
    case "status":
      return "usecases";
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

// Function to set window size for current slide
const setWindowSizeForSlide = async (slide: SlideKey) => {
  try {
    const { width, height } = SLIDE_WINDOW_SIZES[slide];
    await commands.setWindowSize("Onboarding", width, height);
    console.log(`✅ Set window size for ${slide}: ${width}x${height}`);
  } catch (error) {
    console.warn(`⚠️ Failed to set window size for ${slide}:`, error);
    // Don't show error toast for window sizing issues as it's not critical
    // The window will just maintain its current size
  }
};

export default function OnboardingPage() {
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState<SlideKey>("intro");
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<SlideKey[]>(["intro"]);
  const [selectedUsecase, setSelectedUsecase] = useState<string | null>(null);
  const {
    onboardingData,
    completeOnboarding,
    isLoading
  } = useOnboarding();

  const handleUsecaseClick = (option: string) => {
    // Single-select: clicking the same option deselects it, otherwise select the new one
    setSelectedUsecase((prev) => prev === option ? null : option);
  };

  // Load onboarding status on mount
  useEffect(() => {
    const { loadOnboardingStatus } = useOnboarding.getState();
    loadOnboardingStatus();
  }, []);

  // Set window size when slide changes
  useEffect(() => {
    setWindowSizeForSlide(currentSlide);
    setIsVisible(true);
  }, [currentSlide]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Handle redirect if already completed
  useEffect(() => {
    if (onboardingData.isCompleted) {
      const redirectToMain = async () => {
        try {
          await commands.showWindow("Main");
          if (typeof window !== 'undefined' && 'close' in window) {
            window.close();
          }
        } catch (error) {
          console.error("Error redirecting to main window:", error);
        }
      };
      redirectToMain();
    }
  }, [onboardingData.isCompleted]);

  const showSuccessToast = (message: string) => {
    toast({
      title: "Success",
      description: message,
      variant: "default",
    });
  };

  const showErrorToast = (message: string) => {
    toast({
      title: "Error", 
      description: message,
      variant: "destructive",
    });
  };

  const handleNextSlide = async () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    const nextSlide = getNextSlide(currentSlide);

    try {
      trackOnboardingStep(currentSlide, {
        direction: "next",
      });

      // Mark current step as completed
      if (!completedSteps.includes(currentSlide)) {
        setCompletedSteps(prev => [...prev, currentSlide]);
      }

      if (nextSlide) {
        setIsVisible(false);
        setTimeout(async () => {
          setCurrentSlide(nextSlide);
          setError(null);
          setIsTransitioning(false);
        }, 300);
      } else {
        await handleEnd();
      }
    } catch (error) {
      console.error("Error in handleNextSlide:", error);
      showErrorToast("Failed to proceed to next step");
      setIsTransitioning(false);
    }
  };

  const handlePrevSlide = async () => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);

    try {
      trackOnboardingStep(currentSlide, {
        direction: "back",
      });

      setIsVisible(false);

      setTimeout(async () => {
        let prevSlide = getPrevSlide(currentSlide);
        
        if (prevSlide) {
          setError(null);
          setCurrentSlide(prevSlide);
        }
        setIsTransitioning(false);
      }, 300);
    } catch (error) {
      console.error("Error in handlePrevSlide:", error);
      showErrorToast("Failed to go back");
      setIsTransitioning(false);
    }
  };

  const handleEnd = async () => {
    try {
      setIsTransitioning(true);
      trackOnboardingStep("completed");

      // Complete onboarding in backend (only store completion status)
      await completeOnboarding();
      
      showSuccessToast("Onboarding completed successfully!");
      
    //   // Small delay for user to see success message
    //   setTimeout(async () => {
    //     try {
    //       // Show main window and close onboarding window
    //       await commands.closeWindow("Onboarding");
    //       await commands.showWindow("Main");
    //     } catch (windowError) {
    //       console.error("Error managing windows:", windowError);
    //       showErrorToast("Onboarding completed but failed to switch windows");
    //     }
    //   }, 1500);
      
    } catch (error) {
      console.error("Error completing onboarding:", error);
      showErrorToast("Failed to complete onboarding");
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-6 h-6 border border-foreground border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-xs text-muted-foreground">loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background">
      {/* Minimal header with drag region */}
      <div className="w-full bg-background p-4" data-tauri-drag-region>
      </div>

      {/* Main content container */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-2xl mx-auto">
          {currentSlide === "intro" && (
            <OnboardingIntro
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "usecases" && (
            <OnboardingSelection
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              selectedOption={selectedUsecase}
              handleOptionClick={handleUsecaseClick}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "status" && (
            <OnboardingStatus
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleEnd}
            />
          )}
        </div>
      </div>
    </div>
  );
} 