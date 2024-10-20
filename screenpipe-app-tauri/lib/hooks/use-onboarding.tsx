import localforage from "localforage";
import React, { createContext, useState, useContext, useEffect } from "react";

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
      const isFirstTime = await localforage.getItem<boolean>("isFirstTimeUser");
      console.log("isFirstTime", isFirstTime);
      if (isFirstTime === null) {
        setShowOnboarding(true);
      }
    };
    console.log("checkFirstTimeUser");
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
