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
  
    async function setShowOnboardingToFalse() {
      setShowOnboarding(false);
      await localforage.setItem("showOnboarding", false);
    }

    async function setShowOnboardingToTrue() {
      setShowOnboarding(true);
      await localforage.setItem("showOnboarding", true);
    } 
  

    // the following functions can be seen as 
    // named actions that are taken on the onboarding dialog's visibility.
    // this makes it easier to understand why onboarding is visible or not.
    async function skipOnboarding() {
      await setShowOnboardingToFalse();
      posthog.capture("onboarding_skipped");
    }

    async function completeOnboarding() {
      await setShowOnboardingToFalse();
      posthog.capture("onboarding_completed");
    }

    async function handleEnd() {
      trackOnboardingStep("completed", {
        finalOptions: selectedOptions,
        finalPreference: selectedPreference,
        finalPersonalization: selectedPersonalization,
      });

      await setShowOnboardingToFalse();
    };

    // after login, deeplink could be used to show onboarding
    async function loginShowOnboarding() {  
      await setShowOnboardingToTrue();
    }

  // manually show onboarding, for example from the header -> settings
    async function manuallyShowOnboarding() {
      await setShowOnboardingToTrue();
    }
  
    return { 
      showOnboarding, 
      skipOnboarding, 
      completeOnboarding, 
      handleEnd, 
      loginShowOnboarding, 
      manuallyShowOnboarding 
    };
}