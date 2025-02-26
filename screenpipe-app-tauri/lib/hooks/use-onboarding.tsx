import { useSettings } from "./use-settings";
import localforage from "localforage";
import { create } from "zustand";
import { useEffect } from "react";

// Define the store state type
interface OnboardingState {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  initialized: boolean;
}

// Create the Zustand store
export const useOnboardingStore = create<OnboardingState>((set) => ({
  showOnboarding: false,
  initialized: false,
  setShowOnboarding: (show: boolean) => {
    set({ showOnboarding: show });
    localforage.setItem("showOnboarding", show);
  },
}));

// Initialize the store with persisted data
const initializeOnboarding = async () => {
  // Only initialize once
  if (useOnboardingStore.getState().initialized) {
    return;
  }

  const persistedValue = await localforage.getItem("showOnboarding");

  if (persistedValue === null || persistedValue === undefined) {
    // First time user, show onboarding
    useOnboardingStore.setState({
      showOnboarding: true,
      initialized: true,
    });
  } else {
    // Returning user, respect the stored value
    useOnboardingStore.setState({
      showOnboarding: persistedValue === true,
      initialized: true,
    });
  }
};

// Custom hook that combines store with initialization logic
export const useOnboarding = () => {
  const { showOnboarding, setShowOnboarding } = useOnboardingStore();
  const { settings } = useSettings();

  useEffect(() => {
    initializeOnboarding();
  }, [settings]);

  return { showOnboarding, setShowOnboarding };
};

// No longer need the OnboardingProvider component
