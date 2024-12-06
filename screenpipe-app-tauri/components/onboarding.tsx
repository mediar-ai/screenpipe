import localforage from "localforage";
import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useSettings } from "@/lib/hooks/use-settings";
import { onboardingFlow } from './onboarding/entities/constants';
import { useOnboardingFlow } from "./onboarding/context/onboarding-context";
import {useMemo} from 'react';

const setFirstTimeUserFlag = async () => {
  await localforage.setItem("isFirstTimeUser", false);
};

const Onboarding: React.FC = () => {
  const { currentStep } = useOnboardingFlow()
  const { showOnboarding, setShowOnboarding } = useOnboarding();
  const { updateSettings } = useSettings();

  useEffect(() => {
    if (showOnboarding) {
      const hideCloseButton = () => {
        const closeButton = document.querySelector(".lucide-x");
        if (closeButton) {
          (closeButton as HTMLElement).classList.add("hidden");
        }
      };
      setTimeout(hideCloseButton, 100);
    }
  }, [showOnboarding]);
  
  const handleDialogClose = (open: boolean) => {
    if (!open && currentStep) {
      setShowOnboarding(open);
    }
  };

  const handleEnd = async () => {
    setShowOnboarding(false);
    await setFirstTimeUserFlag();
    updateSettings({
      isFirstTimeUser: false,
    });
  };

  return (
    <Dialog open={true} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-4xl h-[640px] max-h-[100vh]">
        <div className="flex flex-col w-full h-full overflow-hidden">
          <T/>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;

export const T = () => {
  const { currentStep, track, handleNextSlide } = useOnboardingFlow()

  const step = useMemo(() => {
    return onboardingFlow[currentStep]
  },[currentStep])

  if (step.condition.isConditional) {
    if (track[step.condition.conditionStep!][step.condition.conditionProperty!] === step.condition.value) {
      return onboardingFlow[currentStep].component()
    } else {
      handleNextSlide()
      return null
    }
  }

  return (
    <>
    {onboardingFlow[currentStep].component()}
    </>
  )
}


