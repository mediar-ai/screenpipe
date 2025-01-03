import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOnboardingFlow } from "./context/onboarding-context";
import OnboardingNavigation from "./navigation";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "../ui/use-toast";

const CardItem: React.FC<{
  option:any;
  isSelected: boolean;
  onClick: () => void;
}> = ({ option, isSelected, onClick }) => {
  const { icon: Icon, title, description, note } = option;

  return (
    <div className="relative group h-[270px]">
      <div
        data-isSelected={isSelected}
        className={`absolute h-full !mt-[-5px] inset-0 rounded-lg transition-all duration-300 ease-out group-hover:before:opacity-100 group-hover:before:scale-100 
        before:absolute before:inset-0 before:rounded-lg before:border-2 before:border-black dark:before:border-white before:opacity-0 before:scale-95 before:transition-all 
        before:duration-300 before:ease-out data-[isSelected=true]:before:!border-none`}
      />
      <Card
        data-isSelected={isSelected}
        className={"p-4 h-full !mt-[-5px] cursor-pointer bg-white dark:bg-gray-800 hover:bg-accent transition-all relative z-[1] duration-300 ease-out group-hover:scale-[0.98] data-[isSelected=true]:bg-accent data-[isSelected=true]:transition-transform data-[isSelected=true]:relative data-[isSelected=true]:border-2 data-[isSelected=true]:border-black data-[isSelected=true]:dark:border-white"}
        onClick={onClick}
      >
        <CardContent className="flex flex-col w-[250px] justify-center">
          <Icon className="w-16 h-16 mx-auto" />
          <h2 className="font-semibold text-xl text-center mt-1">{title}</h2>
          <span className="prose prose-sm mt-1">{description}</span>
          <span className="text-muted-foreground text-center prose-sm mt-4">
            {note}
          </span>
        </CardContent>
      </Card>
    </div>
  );
};

const OnboardingPersonalize = () => {
  const { process, currentStep, handlePrevSlide, handleNextSlide } = useOnboardingFlow()
  const { updateSettings } = useSettings()
  const { toast } = useToast()
  const [isAi, setIsAi] = useState(false)

  function handleSelectionChange(mode:string) {
    console.log(mode)
    if (mode === 'withAI') {
      setIsAi(!isAi)
    } else {
      setIsAi(false)
    }
  }

  const handleNextWithPreference = async () => {
    try {
      if (isAi) {
        await updateSettings({ withAi: true });
        toast({
          title: "success",
          description: "ai-search was enabled successfully",
          variant: "default",
        });
      } else  {
        await updateSettings({ withAi: false });
        toast({
          title: "success",
          description: "conventional search was enabled successfully",
          variant: "default",
        });
      }

      handleNextSlide({ withAi: isAi })
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
      className={`w-full flex justify-center flex-col relative`}
    >
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          do you want to use AI or just plain search?
        </DialogTitle>
      </DialogHeader>
      <div className="flex w-full justify-around mt-6">
        {process[currentStep].meta.options.map((option:any) => (
          <CardItem
            key={option.key}
            option={option}
            isSelected={option.key === 'withAI' ? isAi : !isAi}
            onClick={() => handleSelectionChange(option.key)}
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

export default OnboardingPersonalize;
