import React, { createContext, useContext, SetStateAction, Dispatch } from "react";
import { useOnboardingVisibility } from "./hooks/use-onboarding-visibility";
import { useOnboardingUserInput } from "./hooks/use-onboarding-user-input";

interface OnboardingContextType {
  showOnboarding: boolean;
  selectedOptions: string[];
  selectedPersonalization: string | null;
  selectedPreference: string | null;
  setSelectedOptions: Dispatch<SetStateAction<string[]>>;
  setSelectedPersonalization: Dispatch<SetStateAction<string | null>>;
  setSelectedPreference: Dispatch<SetStateAction<string | null>>;
  setShowOnboardingToFalse: () => void,
  setShowOnboardingToTrue: () => void,
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

  return (
    <OnboardingContext.Provider value={{ 
        showOnboarding,
        selectedOptions,
        selectedPersonalization,
        selectedPreference,
        setSelectedOptions,
        setSelectedPersonalization,
        setSelectedPreference,
        setShowOnboardingToFalse,
        setShowOnboardingToTrue
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

