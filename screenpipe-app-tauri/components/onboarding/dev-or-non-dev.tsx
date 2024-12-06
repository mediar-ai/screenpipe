import React, { useState } from "react";
import { Info } from "lucide-react";
import { Wrench, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingFlow } from "./context/onboarding-context";

interface OnboardingDevOrNonDevProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
  handleOptionClick: (option: string) => void;
  selectedPreference?: string | null;
}

const DEV_OPTIONS = [
  {
    key: "standardMode",
    icon: UserRound,
    title: "standard mode",
    description:
      "screenpipe takes care of everything for you, making it easy and stress-free.",
  },
  {
    key: "devMode",
    icon: Wrench,
    title: "dev mode",
    description:
      "run the CLI on top of the UI, and customize screenpipe to fit your needs.",
  },
];

const CardItem: React.FC<{
  isSelected: boolean;
  onClick: () => void;
  option: (typeof DEV_OPTIONS)[number];
}> = ({ option, isSelected, onClick }) => {
  const { icon: Icon, title, description } = option;

  return (
    <div className="relative group h-64">
      <div
        className={`absolute inset-0 rounded-lg transition-transform duration-300 ease-out group-hover:scale-105`}
      />
      <Card
        className={`p-4 h-64 mt-[-5px] cursor-pointer bg-white dark:bg-gray-800 transition-transform duration-300 ease-out group-hover:scale-105 
        ${isSelected ? "bg-accent" : ""}`}
        onClick={onClick}
      >
        <CardContent className="flex flex-col w-60 justify-start">
          <Icon className="w-12 h-12 mx-auto" />
          <h2 className="font-semibold text-xl text-center mt-1">{title}</h2>
          <span className="text-sm mt-0">{description}</span>
        </CardContent>
      </Card>
    </div>
  );
};

const OnboardingDevOrNonDev = () => {
  const { toast } = useToast();
  const { settings, updateSettings } = useSettings();
  const { handleNextSlide, handlePrevSlide } = useOnboardingFlow();
  const [isDevMode, setIsDevMode] = useState(false);

  const handleNextWithPreference = async () => {
    try {
      if (isDevMode) {
        await updateSettings({ devMode: true });
        toast({
          title: "success",
          description: "dev mode enabled successfully",
          variant: "default",
        });
      } else  {
        await updateSettings({ devMode: false });
        toast({
          title: "success",
          description: "screenpipe backend is in standard mode",
          variant: "default",
        });
        await invoke("spawn_screenpipe");
      }

      handleNextSlide({ devMode: isDevMode })
    } catch (error: any) {
      toast({
        title: "error",
        description: error,
        variant: "destructive",
      });
    }
  };

  function handleDevModeChange(mode:string) {
    if (mode === 'devMode') {
      setIsDevMode(!isDevMode)
    } else {
      setIsDevMode(false)
    }
  }

  return (
    <div
      className={`w-full flex justify-around flex-col relative`}
    >
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          how do you prefer to use screenpipe?
        </DialogTitle>
      </DialogHeader>
      <div className="flex w-full justify-around mt-12">
        {DEV_OPTIONS.map((option) => (
          <CardItem
            key={option.key}
            option={option}
            isSelected={option.key === 'devMode' ? isDevMode : !isDevMode}
            onClick={() => handleDevModeChange(option.key)}
          />
        ))}
      </div>

      <OnboardingNavigation
        className="mt-9"
        nextBtnText="next"
        prevBtnText="previous"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={async () => {
          await handleNextWithPreference();
        }}
      />
    </div>
  );
};

export default OnboardingDevOrNonDev;
