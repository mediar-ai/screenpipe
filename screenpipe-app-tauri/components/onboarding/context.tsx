import React, { createContext, useState, useContext, useEffect } from "react";
import { useSettings } from "../../lib/hooks/use-settings";
import localforage from "localforage";
import posthog from "posthog-js";

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
  const [showOnboarding, setShowOnboarding] = useState(true);
  const { settings } = useSettings();

  useEffect(() => {
    const checkFirstTimeUser = async () => {
      const showOnboarding = await localforage.getItem("showOnboarding");

      if (showOnboarding === null || showOnboarding === undefined || showOnboarding === true) {
        setShowOnboarding(true);
      }
    };
    checkFirstTimeUser();
  }, [settings]);

  function setShowOnboardingToFalse() {
    setShowOnboarding(false);
    localforage.setItem("showOnboarding", false);
  }

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
