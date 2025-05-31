import { useSettings } from "./use-settings";
import localforage from "localforage";
import { create } from "zustand";
import { useEffect } from "react";

// Define the store state type
interface OnboardingState {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  initialized: boolean;
  setInitialized: (initialized: boolean) => void;
}

// Create the Zustand store
export const useOnboardingStore = create<OnboardingState>((set) => ({
  showOnboarding: false,
  initialized: false,
  setShowOnboarding: (show: boolean) => {
    set({ showOnboarding: show });
    // Only persist when explicitly setting to false (completed)
    if (!show) {
      localforage.setItem("onboarding_completed", true);
    }
  },
  setInitialized: (initialized: boolean) => set({ initialized }),
}));

// Initialize the store with persisted data
const initializeOnboarding = async () => {
  const state = useOnboardingStore.getState();
  
  // Only initialize once
  if (state.initialized) {
    return;
  }

  try {
    // Add timeout to prevent hanging on localforage operations
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Initialization timeout")), 1000);
    });

    const initPromise = (async () => {
      // Check if onboarding was completed before
      const onboardingCompleted = await localforage.getItem("onboarding_completed");
      
      // Check if this is a first-time user (no user preferences stored)
      const userPreferences = await localforage.getItem("user_preferences");
      
      // Show onboarding if:
      // 1. Onboarding was never completed AND
      // 2. No user preferences exist (first-time user)
      const shouldShowOnboarding = !onboardingCompleted && !userPreferences;

      return { onboardingCompleted, userPreferences, shouldShowOnboarding };
    })();

    const result = await Promise.race([
      initPromise,
      timeoutPromise
    ]) as { onboardingCompleted: any, userPreferences: any, shouldShowOnboarding: boolean };
    
    const { onboardingCompleted, userPreferences, shouldShowOnboarding } = result;

    useOnboardingStore.setState({
      showOnboarding: shouldShowOnboarding,
      initialized: true,
    });

    console.log("Onboarding initialized:", { 
      onboardingCompleted, 
      userPreferences: !!userPreferences, 
      shouldShowOnboarding 
    });
  } catch (error) {
    console.error("Failed to initialize onboarding:", error);
    // Default to not showing onboarding on error to prevent getting stuck
    useOnboardingStore.setState({
      showOnboarding: false,
      initialized: true,
    });
  }
};

// Custom hook that combines store with initialization logic
export const useOnboarding = () => {
  const { showOnboarding, setShowOnboarding, initialized } = useOnboardingStore();
  const { settings } = useSettings();

  useEffect(() => {
    // Initialize immediately when hook is first called, don't wait for settings
    if (!initialized) {
      // Start initialization immediately
      initializeOnboarding();
      
      // Also set a shorter fallback timeout for better UX
      const fallbackTimeout = setTimeout(() => {
        console.warn("Fallback initialization triggered after 2 seconds");
        useOnboardingStore.setState({
          showOnboarding: false,
          initialized: true,
        });
      }, 2000);

      return () => clearTimeout(fallbackTimeout);
    }
  }, [initialized]);

  return { 
    showOnboarding, 
    setShowOnboarding,
    initialized 
  };
};

// No longer need the OnboardingProvider component
