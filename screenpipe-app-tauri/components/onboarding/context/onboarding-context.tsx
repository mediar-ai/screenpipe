import React, { createContext, useContext, useMemo, useState } from 'react';
import { onboardingFlow, processBase, taskBase } from '../entities/constants';
import { useOnboarding } from '@/lib/hooks/use-onboarding';

type OnboardingFlowContextType = {
  process: ( taskBase | processBase )[];
  track: Record<string,any>;
  setTrack: React.Dispatch<React.SetStateAction<Record<string,any>>>;
  currentStep: number;
  handleNextSlide: (meta?: any) => void
  handlePrevSlide: () => void;
};

const OnboardingFlowContext = createContext<OnboardingFlowContextType | undefined>(undefined);

type OnboardingFlowProviderProps = {
  children: React.ReactNode;
};

export const OnboardingFlowProvider = ({ children }: OnboardingFlowProviderProps) => {
  const process = useMemo(() => onboardingFlow, []);
  const [track, setTrack] = useState<Record<string,any>>({});
  const [currentStep, setCurrentStep] = useState<number>(0);
  const { setShowOnboarding } = useOnboarding()
  console.log({process})
  const handleNextSlide = (meta?: any) => {
    console.log("NEXT SLIDE")
    if ((process.length - 1) === currentStep) {
      setShowOnboarding(false)
    }
    const newTrack = track

    newTrack[process[currentStep].slug] = meta
    setTrack(newTrack)

    setCurrentStep((prevStep) => prevStep + 1);
  };

  const handlePrevSlide = () => {
    setCurrentStep((prevStep) => Math.max(prevStep - 1, 0));
  };

  return (
    <OnboardingFlowContext.Provider
      value={{
        process,
        track,
        setTrack,
        currentStep,
        handleNextSlide,
        handlePrevSlide,
      }}
    >
      {children}
    </OnboardingFlowContext.Provider>
  );
};

export const useOnboardingFlow = (): OnboardingFlowContextType => {
  const context = useContext(OnboardingFlowContext);
  if (!context) {
    throw new Error('useOnboardingFlow must be used within an OnboardingFlowProvider');
  }
  return context;
};