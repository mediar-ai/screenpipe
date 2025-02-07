import localforage from "localforage";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { trackOnboardingStep } from "../flow";

export function useOnboardingVisibility(
  selectedOptions: string[],
  selectedPreference: string | null,
  selectedPersonalization: string | null,
) {
    const [showOnboarding, setShowOnboarding] = useState(true);

    // Value comes from localstorage. Persistent setter is in useOnboardingFlow.ts
    const [restartPending, setRestartPending] = useState(false);
  
    function setShowOnboardingToFalse() {
      setShowOnboarding(false);
    }
  
    function setShowOnboardingToTrue() {
      setShowOnboarding(true);
    }
  
    useEffect(() => {
      const checkFirstTimeUser = async () => {
        const showOnboarding = await localforage.getItem("showOnboarding");
        const screenPermissionRestartPending = await localforage.getItem("screenPermissionRestartPending");
  
        if (showOnboarding === null || showOnboarding === undefined || showOnboarding === true) {
          setShowOnboarding(true);
          setRestartPending(screenPermissionRestartPending === true);
        }
      };
      checkFirstTimeUser();
    }, []);


    function skipOnboarding() {
      setShowOnboardingToFalse();
      posthog.capture("onboarding_skipped");
    }

    function completeOnboarding() {
      setShowOnboardingToFalse();
      posthog.capture("onboarding_completed");
    }

    async function handleEnd() {
      trackOnboardingStep("completed", {
        finalOptions: selectedOptions,
        finalPreference: selectedPreference,
        finalPersonalization: selectedPersonalization,
      });

      setShowOnboardingToFalse();
    };
  
    return { showOnboarding, setShowOnboardingToFalse, setShowOnboardingToTrue, skipOnboarding, completeOnboarding, handleEnd, restartPending };
}