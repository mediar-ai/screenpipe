import React, { createContext, useState, useContext, useEffect } from "react";
import posthog from "posthog-js";
import { useOnboardingVisibility } from "./hooks/use-onboarding-visibility";

interface OnboardingContextType {
  showOnboarding: boolean;
  setShowOnboardingToFalse: (show: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { 
    showOnboarding, 
    setShowOnboardingToFalse, 
    setShowOnboardingToTrue 
  } = useOnboardingVisibility();

  function skipOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_skipped");
  }

  function completeOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_completed");
  }

  return (
    <OnboardingContext.Provider value={{ showOnboarding, setShowOnboardingToFalse }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
};

