import React, { createContext, useState, useContext, useEffect } from "react";
import { useSettings } from "./use-settings";
import localforage from "localforage";

interface OnboardingContextType {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { settings } = useSettings();
  useEffect(() => {
    const checkFirstTimeUser = async () => {
      // settings unreliable here ... race condition
      const isFirstTime = await localforage.getItem("showOnboarding");
      if (isFirstTime) {
        setShowOnboarding(true);
      }
    };
    checkFirstTimeUser();
  }, [settings]);
  useEffect(() => {
    localforage.setItem("showOnboarding", showOnboarding);
  }, [showOnboarding]);
  return (
    <OnboardingContext.Provider value={{ showOnboarding, setShowOnboarding }}>
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
