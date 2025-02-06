import localforage from "localforage";
import { useEffect, useState } from "react";

export function useOnboardingVisibility() {
    const [showOnboarding, setShowOnboarding] = useState(true);
  
    function setShowOnboardingToFalse() {
      setShowOnboarding(false);
    }
  
    function setShowOnboardingToTrue() {
      setShowOnboarding(true);
    }
  
    useEffect(() => {
      const checkFirstTimeUser = async () => {
        const showOnboarding = await localforage.getItem("showOnboarding");
  
        if (showOnboarding === null || showOnboarding === undefined || showOnboarding === true) {
          setShowOnboarding(true);
        }
      };
      checkFirstTimeUser();
    }, []);
  
    return { showOnboarding, setShowOnboardingToFalse, setShowOnboardingToTrue };
  }