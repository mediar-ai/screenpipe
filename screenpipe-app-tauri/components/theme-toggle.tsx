import React from "react";
import { Sun, MoonStar } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className } : ThemeToggleProps) {
  const { currentTheme, toggleTheme } = useTheme();

  return (
    <button onClick={toggleTheme} >
      {currentTheme === "light" 
        ? <Sun className={className} /> 
        : <MoonStar className={className} />}
    </button>
  );
}

