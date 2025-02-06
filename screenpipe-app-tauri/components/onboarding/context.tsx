import React, { createContext, useState, useContext, useEffect } from "react";
import posthog from "posthog-js";
import { useOnboardingVisibility } from "./hooks/use-onboarding-visibility";
import { useOnboardingUserInput } from "./hooks/use-onboarding-user-input";

interface OnboardingContextType {
  showOnboarding: boolean;
  selectedOptions: string[];
  selectedPersonalization: string | null;
  selectedPreference: string | null;
  setSelectedOptions: (options: string[]) => void;
  setSelectedPersonalization: (personalization: string | null) => void;
  setSelectedPreference: (preference: string | null) => void;
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

  const { 
    selectedOptions, 
    setSelectedOptions, 
    selectedPersonalization, 
    setSelectedPersonalization, 
    selectedPreference, 
    setSelectedPreference 
  } = useOnboardingUserInput();

  function skipOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_skipped");
  }

  function completeOnboarding() {
    setShowOnboardingToFalse();
    posthog.capture("onboarding_completed");
  }

  return (
    <OnboardingContext.Provider value={{ 
        showOnboarding,
        selectedOptions,
        selectedPersonalization,
        selectedPreference,
        setSelectedOptions,
        setSelectedPersonalization,
        setSelectedPreference
    }}>
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

