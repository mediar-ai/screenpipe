import { useState, useEffect } from "react";
import type { Settings } from "@screenpipe/browser";

interface AIProviderStatus {
  isAvailable: boolean;
  error: string;
}

export function useAiProvider(settings: Settings): AIProviderStatus {
  const [status, setStatus] = useState<AIProviderStatus>({
    isAvailable: true,
    error: "",
  });

  useEffect(() => {
    const checkAiProvider = async () => {
      try {
        if (!settings.aiProviderType) {
          setStatus({ isAvailable: false, error: "no ai-provider is set" });
          return;
        }
        switch (settings.aiProviderType) {
          case "openai":
            if (!settings.openaiApiKey) {
              setStatus({
                isAvailable: false,
                error: "openai api key not configured",
              });
              return;
            }
            break;

          case "native-ollama":
            try {
              const response = await fetch("http://localhost:11434/api/tags");
              if (!response.ok) throw new Error();
            } catch {
              setStatus({
                isAvailable: false,
                error: "ollama not running on port 11434",
              });
              return;
            }
            break;

          case "screenpipe-cloud":
            if (!settings.user?.token) {
              setStatus({
                isAvailable: false,
                error: "login required for screenpipe cloud",
              });
              return;
            }
            break;

          case "custom":
            if (!settings.aiUrl) {
              setStatus({
                isAvailable: false,
                error: "custom ai url not configured",
              });
              return;
            }
            break;
        }

        setStatus({ isAvailable: true, error: "" });
      } catch (error) {
        setStatus({
          isAvailable: false,
          error: "failed to check ai provider",
        });
      }
    };

    checkAiProvider();
  }, [
    settings.aiProviderType,
    settings.openaiApiKey,
    settings.aiUrl,
    settings.user?.token,
  ]);

  return status;
}
