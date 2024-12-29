import localforage from "localforage";
import React, { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useSettings } from "@/lib/hooks/use-settings";
import { useSelector } from "@xstate/react";
import { screenpipeOnboardingMachine } from "@/features/onboarding/state-machine/onboarding-flow";
import ScreenpipeSystemAtlas from "@/features/system-atlas/views/atlas";
import WelcomeScreen from "@/features/onboarding/views/welcome-screen";

const setFirstTimeUserFlag = async () => {
  await localforage.setItem("isFirstTimeUser", false);
};

const Onboarding: React.FC = () => {
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
    if (!open) {
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
      <DialogContent className="max-w-5xl min-h-[740px] max-h-[100vh] p-0">
        <OnboardingFlow/>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;



function OnboardingFlow(){
  const activeStep = useSelector(screenpipeOnboardingMachine,(snapshot) => snapshot.value)

  if ( activeStep === 'welcome' ) return <WelcomeScreen/>

  return <ScreenpipeSystemAtlas actorRef={screenpipeOnboardingMachine}/>

}
