import localforage from "localforage";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { trackOnboardingStep } from "../flow";

export function useOnboardingVisibility(
  selectedOptions: string[],
  selectedPreference: string | null,
  selectedPersonalization: string | null,
) {
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
      const checkFirstTimeUser = async () => {
        const showOnboarding = await localforage.getItem("showOnboarding");
  
        if (showOnboarding === null || showOnboarding === undefined || showOnboarding === true) {
          setShowOnboarding(true);
        }
      };
      checkFirstTimeUser();
    }, []);
  
    function setShowOnboardingToFalse() {
      setShowOnboarding(false);
    }
  
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
  
    return { showOnboarding, skipOnboarding, completeOnboarding, handleEnd };
}