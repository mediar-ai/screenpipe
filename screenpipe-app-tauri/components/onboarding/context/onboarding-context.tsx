import React, { createContext, useContext, useMemo, useState } from 'react';
import { onboardingFlow } from '../entities/constants';
import { useOnboarding } from '@/lib/hooks/use-onboarding';
import { processBase, taskBase } from '../entities/types';

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

  const handleIfLastStep = () => {
    if ((process.length - 1) === currentStep) {
      setShowOnboarding(false)
    }
  }

  const handleStepChange = (givenStep: number, goForward: boolean) => {
    let nexStepIndex = goForward ? givenStep + 1 : givenStep - 1
    let nextStep = process[nexStepIndex]

    if (nextStep.condition.isConditional && nextStep.condition.conditions) {
      let conditionsAreMet = false

      for (const condition of nextStep.condition.conditions) {
        if (track[condition.conditionStep!][condition.conditionProperty!] === condition.value) {
          conditionsAreMet = true
        } else {
          conditionsAreMet = false
        }
      }

      if (conditionsAreMet) {
        setCurrentStep(nexStepIndex);
      } else {
        handleStepChange(nexStepIndex, goForward)
        return null
      }
    }

    setCurrentStep(nexStepIndex)
  }

  const handleNextSlide = (meta?: any) => {
    handleIfLastStep()

    if (meta) {
      const newTrack = track
      newTrack[process[currentStep].slug] = meta
      setTrack(newTrack)
    }

    handleStepChange(currentStep, true)
  };

  const handlePrevSlide = () => {
    handleStepChange(currentStep, false)
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