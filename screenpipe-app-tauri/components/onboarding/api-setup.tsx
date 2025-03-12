import React, { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { CardContent } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { open } from "@tauri-apps/plugin-shell";

import OnboardingNavigation from "@/components/onboarding/navigation";
import { AIPresets } from "../settings/ai-presets";

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
  const { settings } = useSettings();
  const [isValidating, setIsValidating] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Add effect to scroll to top when component mounts
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: "auto"
      });
    }
  }, []);

  // Check if at least one preset exists and has required fields
  const hasValidPreset = React.useMemo(() => {
    if (!settings.aiPresets || settings.aiPresets.length === 0) return false;
    
    // Find the default preset or the first one if no default is set
    const defaultPreset = settings.aiPresets.find(p => p.defaultPreset) || settings.aiPresets[0];
    
    if (!defaultPreset) return false;
    
    // Check if the preset has the required fields
    const { url, model, provider } = defaultPreset;
    const isApiKeyRequired = 
      url !== "https://ai-proxy.i-f9f.workers.dev/v1" && 
      url !== "http://localhost:11434/v1";
      
    // Check if API key is required and present
    const hasRequiredApiKey = !isApiKeyRequired || 
      ((provider === "openai" || provider === "custom") && 
       "apiKey" in defaultPreset && 
       defaultPreset.apiKey?.trim() !== "");
      
    return url?.trim() !== "" && 
           model?.trim() !== "" && 
           hasRequiredApiKey;
  }, [settings.aiPresets]);

  const handleValidationMoveNextSlide = async () => {
    setIsValidating(true);
    
    try {
      // Find the default preset or the first one
      const defaultPreset = settings.aiPresets.find(p => p.defaultPreset) || settings.aiPresets[0];
      
      if (!defaultPreset) {
        toast({
          title: "No AI preset found",
          description: "Please create at least one AI preset",
          variant: "destructive",
        });
        setIsValidating(false);
        return false;
      }
      
      const { url, model, provider } = defaultPreset;
      // Get API key if available based on provider
      const apiKey = (provider === "openai" || provider === "custom") && "apiKey" in defaultPreset 
        ? defaultPreset.apiKey 
        : "";
      
      const t = toast({
        title: "Validating AI provider",
        description: "Please wait...",
        duration: 10000,
      });
      
      const response = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: "You are a helpful assistant that tells short jokes.",
            },
          ],
          max_tokens: 5,
        }),
      });
      
      t.dismiss();
      
      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: "Error validating AI provider",
          description: errorData.error?.message || "Unknown error",
          variant: "destructive",
        });
        setIsValidating(false);
        return false;
      }
      
      toast({
        title: "AI provider validated successfully",
        description: "You're all set!",
      });
      
      setIsValidating(false);
      handleNextSlide();
      return true;
    } catch (error) {
      toast({
        title: "Error validating AI provider",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setIsValidating(false);
      return false;
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`${className} w-full flex flex-col items-center relative max-h-full overflow-y-auto`}>
      <div className="flex flex-col items-center justify-start w-full overflow-visible pt-4">
        <div className="flex flex-col px-2 justify-center items-center">
          <img
            className="w-24 h-24 justify-center"
            src="/128x128.png"
            alt="screenpipe-logo"
          />
          <DialogTitle className="text-center text-2xl">
            setup your ai settings
          </DialogTitle>
        </div>
        <div className="mt-4 h-full w-full">
          <CardContent className="flex flex-col items-center space-y-4 h-full">
            <AIPresets />
            <a
              onClick={() =>
                open("https://github.com/ollama/ollama?tab=readme-ov-file#ollama")
              }
              href="#"
              className="text-muted-foreground text-sm !text-center hover:underline"
            >
              don&apos;t have api key ? set up ollama locally
              <ArrowUpRight className="inline w-4 h-4 ml-1" />
            </a>
          </CardContent>
        </div>
      
      </div>
      <OnboardingNavigation
        className="pt-8"
        isLoading={isValidating}
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={
          hasValidPreset
            ? handleValidationMoveNextSlide
            : handleNextSlide
        }
        prevBtnText="previous"
        nextBtnText={hasValidPreset ? "setup" : "i'll setup later"}
      />
    </div>
  );
};

export default OnboardingAPISetup;
