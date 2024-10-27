import { useState, useEffect } from "react";
import { useTheme as useNextTheme } from "next-themes";

export function useTheme() {
  const { theme, setTheme } = useNextTheme();
  const [currentTheme, setCurrentTheme] = useState(theme);
  const [mounted, setMounted] = useState(false); // to prevent hydration error

  useEffect(() => {
    setMounted(true);
  }, [])

  useEffect(() => {
    if (mounted) {
      setCurrentTheme(theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

  return { currentTheme, toggleTheme, mounted };
}

