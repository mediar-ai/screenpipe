import React, { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { open } from "@tauri-apps/plugin-shell";

import OnboardingNavigation from "@/components/onboarding/navigation";

import AISection from "../settings/ai-section";

interface OnboardingAPISetupProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OnboardingAPISetup: React.FC<OnboardingAPISetupProps> = ({
  className,
  handleNextSlide,
  handlePrevSlide,
}) => {
  const { toast } = useToast();
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [areAllInputsFilled, setAreAllInputsFilled] = React.useState(false);
  const [errors, setErrors] = React.useState<{ [key: string]: string }>({});
  const [isValidating, setIsValidating] = React.useState(false);

  useEffect(() => {
    const { aiUrl, openaiApiKey, aiModel } = localSettings;
    const isApiKeyRequired =
      aiUrl !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
      aiUrl !== "http://localhost:11434/v1";

    setAreAllInputsFilled(
      aiUrl.trim() !== "" &&
        aiModel.trim() !== "" &&
        (!isApiKeyRequired || openaiApiKey.trim() !== "")
    );
  }, [localSettings]);

  const validateInputs = async () => {
    const { aiUrl, openaiApiKey, aiModel } = localSettings;
    const newErrors: { [key: string]: string } = {};
    try {
      const t = toast({
        title: "validating AI provider",
        description: "please wait...",
        duration: 10000,
      });
      const response = await fetch(`${aiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            {
              role: "user",
              content: "You are a helpful assistant that tells short jokes.",
            },
            {
              role: "user",
              content:
                "Tell me a very short joke (1-2 sentences) about screen recording, AI, and screenpipe, answer in lower case only.",
            },
          ],
          max_tokens: 60,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const joke = data.choices[0].message.content.trim();

        console.log("ai is ready!", joke);
        t.update({
          id: t.id,
          title: "ai is ready!",
          description: `here's a joke: ${joke}`,
          duration: 5000,
        });
      } else {
        const errorData = await response.json();
        console.log("errorData", errorData);

        if (response.status === 401) {
          if (aiUrl.includes("worker")) {
            newErrors.openaiApiKey =
              "unauthorized: please login or check your subscription";
          } else {
            newErrors.openaiApiKey = "unauthorized: invalid api key";
          }
        } else {
          newErrors.openaiApiKey = `invalid api key or model: ${
            errorData.error?.message?.toLowerCase() || "unknown error"
          }`;
        }
      }
    } catch (error: any) {
      if (error.message.includes("Failed to fetch")) {
        newErrors.openaiApiKey =
          "connection failed: check your internet or ai provider url";
      } else {
        newErrors.openaiApiKey = `failed to validate api key: ${error.message.toLowerCase()}`;
      }
    }

    setErrors(newErrors);
    Object.keys(newErrors).forEach((key) => {
      toast({
        title: "api key validation error",
        description: newErrors[key],
        variant: "destructive",
      });
    });
    return Object.keys(newErrors).length === 0;
  };

  const handleValidationMoveNextSlide = async () => {
    setIsValidating(true);
    // Update settings here, before validation
    updateSettings(localSettings);
    const isValid = await validateInputs();
    setIsValidating(false);
    if (isValid) {
      handleNextSlide();
    }
  };

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  return (
    <div className={`flex h-[80%] flex-col ${className}`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          setup your ai settings
        </DialogTitle>
      </DialogHeader>
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center space-y-4 max-h-[60vh] overflow-y-auto ">
          <AISection />
          <div className="mb-16" />
          <div className="mb-16" />
          <div className="mb-16" />
          <div className="mb-16" />
          <div className="mb-16" />
          <div className="mb-16" />
        </CardContent>
      </Card>
      <a
        onClick={() =>
          open("https://github.com/ollama/ollama?tab=readme-ov-file#ollama")
        }
        href="#"
        className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline"
      >
        don&apos;t have api key ? set up ollama locally
        <ArrowUpRight className="inline w-4 h-4 ml-1 " />
      </a>
      <OnboardingNavigation
        className="mt-8"
        isLoading={isValidating}
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={
          areAllInputsFilled
            ? handleValidationMoveNextSlide
            : () => {
                updateSettings(localSettings);
                handleNextSlide();
              }
        }
        prevBtnText="previous"
        nextBtnText={areAllInputsFilled ? "setup" : "i'll setup later"}
      />
    </div>
  );
};

export default OnboardingAPISetup;
