"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingStatus from "@/components/onboarding/status";
import OnboardingIntro from "@/components/onboarding/introduction";
import OnboardingAPISetup from "@/components/onboarding/api-setup";
import OnboardingInstructions from "@/components/onboarding/explain-instructions";
import OnboardingLogin from "@/components/onboarding/login";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import posthog from "posthog-js";
import { commands } from "@/lib/utils/tauri";

type SlideKey =
  | "intro"
  | "status" 
  | "login"
  | "apiSetup"
  | "instructions";

// Window size configurations for each slide
const SLIDE_WINDOW_SIZES: Record<SlideKey, { width: number; height: number }> = {
  intro: { width: 1100, height: 850 }, // Increased for demo content
  status: { width: 1100, height: 850 }, // Good for status checks
  login: { width: 1100, height: 680 }, // Compact for login form
  apiSetup: { width: 1100, height: 1000 }, // Taller for AI presets configuration
  instructions: { width: 1100, height: 1050 }, // Largest for the final comprehensive instructions
};

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
  const { 
    onboardingData, 
    completeOnboarding, 
    isLoading 
  } = useOnboarding();

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

  const handleSkip = async () => {
    if (isTransitioning) return;
    
    try {
      setIsTransitioning(true);
      trackOnboardingStep("completed", { skipped: true });
      
      // Removed success toast to avoid spam
      await handleEnd();
    } catch (error) {
      console.error("Error skipping onboarding:", error);
      showErrorToast("Failed to skip onboarding");
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading onboarding...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background">
      {/* Progress indicator with drag region */}
      <div className="w-full bg-secondary p-4" data-tauri-drag-region>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Progress:</span>
            <div className="text-sm text-muted-foreground">
              Step {["intro", "status", "login", "apiSetup", "instructions"].indexOf(currentSlide) + 1} of 5
            </div>
          </div>
          <button
            onClick={handleSkip}
            disabled={isTransitioning}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Skip onboarding
          </button>
        </div>
      </div>

      {/* Main content container - centered and properly sized */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-4xl mx-auto h-full flex items-center justify-center">
          {currentSlide === "intro" && (
            <OnboardingIntro
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "status" && (
            <OnboardingStatus
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handlePrevSlide={handlePrevSlide}
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "login" && (
            <OnboardingLogin
              className={`transition-opacity duration-300 w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "apiSetup" && (
            <OnboardingAPISetup
              className={`transition-opacity duration-300 ease-in-out w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleNextSlide}
              handlePrevSlide={handlePrevSlide}
            />
          )}
          {currentSlide === "instructions" && (
            <OnboardingInstructions
              className={`transition-opacity duration-300 ease-in-out w-full
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`}
              handleNextSlide={handleEnd}
              handlePrevSlide={handlePrevSlide}
            />
          )}
        </div>
      </div>
    </div>
  );
} 