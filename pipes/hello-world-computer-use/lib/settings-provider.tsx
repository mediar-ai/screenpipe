"use client";

import { createContext, useContext, ReactNode } from "react";
import { useSettings as useSettingsApp } from "@/lib/hooks/use-settings";

// Create a context for settings
type SettingsContextType = ReturnType<typeof useSettingsApp>;

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

// Provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
  const settingsData = useSettingsApp();

  console.log(
    "settings provider initialized with data:",
    settingsData.loading ? "loading..." : "loaded",
  );

  return (
    <SettingsContext.Provider value={settingsData}>
      {children}
    </SettingsContext.Provider>
  );
}

// Hook to use settings in any component
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
