import React, { useState } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  UserRound,
  CircleCheck,
  BriefcaseBusiness,
  Wrench,
  SlidersHorizontal,
} from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";
import posthog from "posthog-js";
import { useOnboardingFlow } from "./context/onboarding-context";
import { onboardingFlow } from './entities/constants';

const SelectionItem: React.FC<{
  option: any;
  isSelected: boolean | undefined;
  onClick: () => void;
}> = ({ option, isSelected, onClick }) => {
  const { icon: Icon, label, description } = option;
  return (
    <div
      data-isSelected={isSelected}
      className={"w-[90%] flex items-center border prose prose-sm rounded-lg m-[10px] px-4 py-[10px] hover:bg-accent cursor-pointer data-[isSelected=true]:bg-primary data-[isSelected=true]:text-primary-foreground data-[isSelected=true]:transition data-[isSelected=true]:duration-300 data-[isSelected=true]:hover:bg-primary/90"}
      onClick={onClick}
    >
      <span className="float-left">
        <Icon className="inline h-4 w-4 mr-2" />
        {label}{" "}
        {description && <span className="text-[12px]">({description})</span>}
      </span>
      {isSelected && <CircleCheck className="inline h-4 w-4 ml-auto" />}
    </div>
  );
};

const OnboardingSelection = () => {
  const { handleNextSlide, handlePrevSlide, process: onboardingFlow, currentStep } = useOnboardingFlow();
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());

  const removeOption = (option: string) => {
    setSelectedOptions((prevOptions) => {
      const updatedOptions = new Set(prevOptions);
      updatedOptions.delete(option);
      return updatedOptions;
    });
  };

  const addOption = (option: string) => {
    setSelectedOptions((prevOptions) => new Set(prevOptions).add(option));
  };

  function handleOptionClick(option: string) {
    if (selectedOptions.has(option)){
      removeOption(option)
    } else {
      addOption(option)
    }
  }

  const handleNext = () => {
    if (process.env.NODE_ENV !== 'development') {
      posthog.capture("onboarding_usecases_selected", {
        selected_options: selectedOptions,
      });
    }

    handleNextSlide();
  };

  return (
    <div className={`flex flex-col h-full`}>
      <DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img
          className="w-24 h-24 justify-center"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <DialogTitle className="text-center text-2xl">
          what are you planning to use the screenpipe for?
        </DialogTitle>
      </DialogHeader>

      <div className="flex relative mt-8 justify-center items-center flex-col">
        <span className="text-[15px] w-full text-center text-muted-foreground mb-2">
          you can select multiple options:
        </span>
        {onboardingFlow[currentStep].meta.options.map((option: any) => (
          <SelectionItem
            key={option.key}
            option={option}
            isSelected={selectedOptions?.has(option.key)}
            onClick={() => handleOptionClick(option.key)}
          />
        ))}
      </div>
      <OnboardingNavigation
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNext}
        prevBtnText="previous"
        nextBtnText="next"
      />
    </div>
  );
};

export default OnboardingSelection;
