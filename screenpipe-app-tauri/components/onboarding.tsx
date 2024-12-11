import localforage from "localforage";
import React, { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useSettings } from "@/lib/hooks/use-settings";
import { onboardingFlow } from './onboarding/entities/constants';
import { useOnboardingFlow } from "./onboarding/context/onboarding-context";

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
      <DialogContent className="max-w-5xl min-h-[740px] max-h-[100vh]">
        <div className="flex flex-col w-full h-full">
          <T/>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;

export const T = () => {
  const { currentStep, track, handleNextSlide } = useOnboardingFlow()

  return (
    <>
    {onboardingFlow[currentStep].component()}
    </>
  )
}


