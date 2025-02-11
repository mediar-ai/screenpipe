import React, { createContext, useContext, SetStateAction, Dispatch } from "react";
import { useOnboardingVisibility } from "./hooks/use-onboarding-visibility";
import { useOnboardingUserInput } from "./hooks/use-onboarding-user-input";
import { useOnboardingFlow } from "./hooks/use-onboarding-flow";
import { SlideKey } from "./flow";

interface OnboardingContextType {
  showOnboarding: boolean;
  selectedOptions: string[];
  selectedPersonalization: string | null;
  selectedPreference: string | null;
  setSelectedOptions: Dispatch<SetStateAction<string[]>>;
  setSelectedPersonalization: Dispatch<SetStateAction<string | null>>;
  setSelectedPreference: Dispatch<SetStateAction<string | null>>;
  currentSlide: SlideKey;
  error: string | null;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  handleEnd: () => Promise<void>;
  setRestartPending: () => Promise<void>;
  loginShowOnboarding: () => void;
} 

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { 
    selectedOptions, 
    setSelectedOptions, 
    selectedPersonalization, 
    setSelectedPersonalization, 
    selectedPreference, 
    setSelectedPreference 
  } = useOnboardingUserInput();

  const { 
    showOnboarding, 
    skipOnboarding,
    completeOnboarding,
    handleEnd,
    loginShowOnboarding
  } = useOnboardingVisibility(
    selectedOptions,
    selectedPreference,
    selectedPersonalization,
  );

  const { 
    currentSlide, 
    error, 
    handleNextSlide, 
    handlePrevSlide,
    setRestartPending
  } = useOnboardingFlow(
    selectedOptions,
    selectedPreference,
    selectedPersonalization,
  );

  return (
    <OnboardingContext.Provider value={{ 
        showOnboarding,
        selectedOptions,
        selectedPersonalization,
        selectedPreference,
        setSelectedOptions,
        setSelectedPersonalization,
        setSelectedPreference,
        currentSlide,
        error,
        handleNextSlide,
        handlePrevSlide,
        skipOnboarding,
        completeOnboarding,
        handleEnd,
        setRestartPending,
        loginShowOnboarding
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

