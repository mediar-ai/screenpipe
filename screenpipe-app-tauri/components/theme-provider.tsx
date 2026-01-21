"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { type ColorTheme } from "@/lib/constants/colors";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ColorTheme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
  toggleTheme: () => void;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  toggleTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "screenpipe-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ColorTheme | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem(storageKey) as ColorTheme;
    if (storedTheme) {
      setTheme(storedTheme);
    } else {
      setTheme("system");
    }
    setIsLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!theme || !isLoaded) return;
    
    const root = window.document.documentElement;
    
    // Remove all theme classes first
    root.classList.remove("light", "dark");
    
    // Determine the actual theme to apply
    let actualTheme: "light" | "dark";
    
    if (theme === "system") {
      actualTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
        
      // Listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = () => {
        if (theme === "system") {
          const newActualTheme = mediaQuery.matches ? "dark" : "light";
          root.classList.remove("light", "dark");
          root.classList.add(newActualTheme);
        }
      };
      
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    } else {
      actualTheme = theme;
    }
    
    // Add the actual theme class
    root.classList.add(actualTheme);
  }, [theme, isLoaded]);

  const value = {
    theme: theme || defaultTheme,
    setTheme: (theme: ColorTheme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    toggleTheme: () => {
      const currentTheme = theme || defaultTheme;
      const newTheme = currentTheme === "light" ? "dark" : "light";
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}; 