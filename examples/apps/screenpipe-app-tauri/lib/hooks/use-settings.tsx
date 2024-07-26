import { useState, useEffect } from "react";

interface Settings {
  openaiApiKey: string;
  useOllama: boolean;
  isLoading: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    openaiApiKey: "",
    useOllama: false,
    isLoading: true,
  });

  useEffect(() => {
    const loadSettings = () => {
      const savedKey = localStorage.getItem("openaiApiKey") || "";
      const savedUseOllama = localStorage.getItem("useOllama") === "true";
      setSettings({
        openaiApiKey: savedKey,
        useOllama: savedUseOllama,
        isLoading: false,
      });
    };
    loadSettings();
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prevSettings) => {
      const updatedSettings = { ...prevSettings, ...newSettings };
      localStorage.setItem("openaiApiKey", updatedSettings.openaiApiKey);
      localStorage.setItem("useOllama", updatedSettings.useOllama.toString());
      return updatedSettings;
    });
  };

  return { settings, updateSettings };
}
