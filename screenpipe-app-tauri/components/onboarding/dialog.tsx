import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import OnboardingPipes from "@/components/onboarding/slides/pipes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OnboardingStatus from "@/components/onboarding/slides/status";
import OnboardingIntro from "@/components/onboarding/slides/introduction";
import OnboardingAPISetup from "@/components/onboarding/slides/api-setup";
import OnboardingPersonalize from "@/components/onboarding/slides/personalize";
import OnboardingDevOrNonDev from "@/components/onboarding/slides/dev-or-non-dev";
import OnboardingDevConfig from "@/components/onboarding/slides/dev-configuration";
import OnboardingSelection from "@/components/onboarding/slides/usecases-selection";
import OnboardingInstructions from "@/components/onboarding/slides/explain-instructions";
import { useOnboarding } from "@/components/onboarding/context";
import OnboardingLogin from "./slides/login";
import OnboardingPipeStore from "./slides/pipe-store";
import { SlideKey } from "./flow";
import { AnimatePresence, motion } from "framer-motion";

const SlidesPerKey: Record<SlideKey, () => React.JSX.Element> = {
  [SlideKey.INTRO]: () => <OnboardingIntro/>,
  [SlideKey.STATUS]: () => <OnboardingStatus/>,
  [SlideKey.LOGIN]: () => <OnboardingLogin/>,
  [SlideKey.SELECTION]: () => <OnboardingSelection/>,
  [SlideKey.PERSONALIZE]: () => <OnboardingPersonalize/>,
  [SlideKey.API_SETUP]: () => <OnboardingAPISetup/>,
  [SlideKey.PIPE_STORE]: () => <OnboardingPipeStore/>,
  [SlideKey.DEV_OR_NON_DEV]: () => <OnboardingDevOrNonDev/>,
  [SlideKey.DEV_CONFIG]: () => <OnboardingDevConfig/>,
  [SlideKey.PIPES]: () => <OnboardingPipes/>,
  [SlideKey.INSTRUCTIONS]: () => <OnboardingInstructions/>,
}

const Onboarding: React.FC = () => {
  const { showOnboarding, currentSlide, error } = useOnboarding();
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({
        title: "error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <Dialog open={showOnboarding} onOpenChange={(t) => console.log({t})}>
      <DialogContent className="max-w-4xl h-[640px] max-h-[100vh]" hideCloseButton>
        <AnimatePresence mode="wait">
          <motion.div 
          key={currentSlide} 
          className="flex flex-col w-full h-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          >
            {SlidesPerKey[currentSlide]()}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default Onboarding;
