"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingSetup from "@/components/onboarding/status";
import ReadContent from "@/components/onboarding/read-content";
import ShortcutGate from "@/components/onboarding/shortcut-gate";
import OnboardingLogin from "@/components/onboarding/login-gate";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import posthog from "posthog-js";
import { commands } from "@/lib/utils/tauri";

type SlideKey = "login" | "setup" | "read" | "shortcut";

const SLIDE_WINDOW_SIZES: Record<SlideKey, { width: number; height: number }> = {
  login: { width: 500, height: 480 },
  setup: { width: 500, height: 560 },
  read: { width: 500, height: 520 },
  shortcut: { width: 520, height: 480 },
};

const setWindowSizeForSlide = async (slide: SlideKey) => {
  try {
    const { width, height } = SLIDE_WINDOW_SIZES[slide];
    await commands.setWindowSize("Onboarding", width, height);
  } catch {
    // non-critical
  }
};

export default function OnboardingPage() {
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState<SlideKey>("login");
  const [isVisible, setIsVisible] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { onboardingData, isLoading } = useOnboarding();

  // Restore saved step on mount
  useEffect(() => {
    const init = async () => {
      const { loadOnboardingStatus } = useOnboarding.getState();
      await loadOnboardingStatus();
      const { onboardingData } = useOnboarding.getState();

      if (onboardingData.currentStep && !onboardingData.isCompleted) {
        const step = onboardingData.currentStep as string;
        // Map any old step names to new ones
        const stepMap: Record<string, SlideKey> = {
          login: "login",
          setup: "setup",
          read: "read",
          shortcut: "shortcut",
          // backwards compat with old onboarding
          welcome: "login",
          intro: "login",
          usecases: "setup",
          status: "setup",
        };
        const mapped = stepMap[step];
        if (mapped) {
          setCurrentSlide(mapped);
        }
      }
    };
    init();
  }, []);

  // Set window size + track view when slide changes
  useEffect(() => {
    setWindowSizeForSlide(currentSlide);
    setIsVisible(true);
    posthog.capture(`onboarding_${currentSlide}_viewed`);
  }, [currentSlide]);

  // Redirect if already completed
  useEffect(() => {
    if (onboardingData.isCompleted) {
      commands
        .showWindow("Main")
        .then(() => window.close())
        .catch(() => {});
    }
  }, [onboardingData.isCompleted]);

  useEffect(() => {
    // nothing needed for error state currently
  }, [toast]);

  const handleNextSlide = async () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    posthog.capture(`onboarding_${currentSlide}_completed`);
    const stepOrder: SlideKey[] = ["login", "setup", "read", "shortcut"];
    const currentIdx = stepOrder.indexOf(currentSlide);
    posthog.capture("onboarding_step_reached", {
      step_name: `${currentSlide}_completed`,
      step_index: currentIdx + 1,
    });

    const nextSlide = stepOrder[currentIdx + 1] || "shortcut";
    try {
      await commands.setOnboardingStep(nextSlide);
    } catch {
      // non-critical
    }

    setIsVisible(false);
    setTimeout(() => {
      setCurrentSlide(nextSlide);
      setIsVisible(true);
      setIsTransitioning(false);
    }, 300);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background">
      {/* Drag region */}
      <div className="w-full bg-background p-3" data-tauri-drag-region />

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div
          className={`w-full max-w-lg mx-auto transition-opacity duration-300 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {currentSlide === "login" && (
            <OnboardingLogin handleNextSlide={handleNextSlide} />
          )}
          {currentSlide === "setup" && (
            <OnboardingSetup
              className=""
              handleNextSlide={handleNextSlide}
            />
          )}
          {currentSlide === "read" && (
            <ReadContent handleNextSlide={handleNextSlide} />
          )}
          {currentSlide === "shortcut" && <ShortcutGate />}
        </div>
      </div>
    </div>
  );
}
