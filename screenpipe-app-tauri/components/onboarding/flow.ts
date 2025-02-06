import posthog from "posthog-js";

export const SlideKey = {
    INTRO: "intro",
    STATUS: "status",
    LOGIN: "login",
    SELECTION: "selection",
    PERSONALIZE: "personalize",
    API_SETUP: "apiSetup",   
    DEV_OR_NON_DEV: "devOrNonDev",
    DEV_CONFIG: "devConfig",
    PIPES: "pipes",
    PIPE_STORE: "pipeStore",
    INSTRUCTIONS: "instructions",   
} as const 

export type SlideKey = (typeof SlideKey)[keyof typeof SlideKey];

export const slideFlow: Record<
  SlideKey,
  {
    next: (
      selectedOptions?: string[],
      selectedPreference?: string | null,
      selectedPersonalization?: string | null
    ) => SlideKey | null;
    prev: (
      selectedOptions?: string[],
      selectedPreference?: string | null,
      selectedPersonalization?: string | null
    ) => SlideKey | null;
  }
> = {
  intro: {
    // introduction video of screenpipe
    next: () => "status",
    prev: () => null,
  },
  status: {
    // status of screenpipe (blockage or not)
    next: () => "login",
    prev: () => "intro",
  },
  login: {
    // login
    next: () => "apiSetup",
    prev: () => "status",
  },
  selection: {
    // selection (four options)
    next: (selectedOptions) => {
      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0)
        return null;
      return "devOrNonDev";
    },
    prev: () => "status",
  },
  personalize: {
    // personalize (with ai or without ai)
    next: (selectedOptions, __, selectedPersonalization) => {
      if (selectedPersonalization === "withAI") return "apiSetup";
      if (
        selectedOptions?.includes("personalUse") &&
        selectedPersonalization === "withoutAI"
      )
        return "instructions";
      return "instructions";
    },
    prev: () => "selection",
  },
  apiSetup: {
    // api setup & validation
    next: () => "pipeStore",
    prev: () => "login",
  },
  pipeStore: {
    // pipe store
    next: () => null,
    prev: () => "apiSetup",
  },
  devOrNonDev: {
    // dev or no dev
    next: (selectedOptions, selectedPreference, selectedPersonalization) => {
      if (
        selectedOptions?.includes("personalUse") &&
        selectedPersonalization === "withoutAI" &&
        selectedPreference === "nonDevMode"
      )
        return "instructions";
      if (selectedPreference === "devMode") return "devConfig";
      return "personalize";
    },
    prev: () => "selection",
  },
  devConfig: {
    // dev configuration
    next: () => "pipes",
    prev: () => "devOrNonDev",
  },
  pipes: {
    // explain about pipes to dev
    next: () => "instructions",
    prev: () => "devConfig",
  },
  instructions: {
    // instructions for every type of user
    next: () => null,
    prev: (selectedOptions, selectedPreference, selectedPersonalization) => {
      if (selectedPreference === "devMode") return "pipes";
      if (selectedOptions?.includes("personalUse")) return "personalize";
      if (selectedOptions?.includes("professionalUse")) return "personalize";
      if (selectedOptions?.includes("developmentlUse")) return "personalize";
      if (selectedPersonalization === "withAI") return "apiSetup";
      return "devOrNonDev";
    },
  },
};

export const trackOnboardingStep = (
  step: SlideKey | "completed",
  properties?: Record<string, any>
) => {
  posthog.capture("onboarding_step", {
    step,
    ...properties,
  });
};