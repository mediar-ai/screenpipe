import React, { useState } from "react";
import { Info } from "lucide-react";
import { Wrench, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { invoke } from "@tauri-apps/api/core";

interface OnboardingDevOrNonDevProps {
  className?: string;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
  handleOptionClick: (option: string) => void;
  selectedPreference?: string | null;
}

const DEV_OPTIONS = [
  {
    key: "nonDevMode",
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

const OnboardingDevOrNonDev: React.FC<OnboardingDevOrNonDevProps> = ({
  className = "",
  selectedPreference = "",
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
}) => {
  const { toast } = useToast();
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleNextWithPreference = async (option: string) => {
    try {
      if (option === "devMode") {
        await updateSettings({ devMode: true });
        setLocalSettings({ ...localSettings, devMode: true });
        toast({
          title: "success",
          description: "dev mode enabled successfully",
          variant: "default",
        });
      } else if (option === "nonDevMode") {
        await updateSettings({ devMode: false });
        setLocalSettings({ ...localSettings, devMode: false });
        toast({
          title: "success",
          description: "screenpipe backend is in standard mode",
          variant: "default",
        });
        // TODO: should give better user feedback
        await invoke("spawn_screenpipe");
      }
    } catch (error: any) {
      toast({
        title: "error",
        description: error,
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className={`${className} w-full flex justify-around flex-col relative`}
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
            isSelected={selectedPreference === option.key}
            onClick={() => handleOptionClick(option.key)}
          />
        ))}
      </div>

      <OnboardingNavigation
        className="mt-9"
        nextBtnText="next"
        prevBtnText="previous"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={async () => {
          if (selectedPreference) {
            await handleNextWithPreference(selectedPreference);
          }
          handleNextSlide();
        }}
      />
    </div>
  );
};

export default OnboardingDevOrNonDev;
