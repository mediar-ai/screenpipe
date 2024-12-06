import { onboardingFlow } from "@/components/onboarding/entities/constants";
import { toast, useToast } from "@/components/ui/use-toast";
import localforage from "localforage";
import React, { createContext, useState, useContext, useEffect, useMemo } from "react";

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
  useEffect(() => {
    const checkFirstTimeUser = async () => {
      // const isFirstTime = await localforage.getItem<boolean>("isFirstTimeUser");
      // if (isFirstTime === null) {
        setShowOnboarding(true);
      // }
    };
    checkFirstTimeUser();
  }, []);
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
