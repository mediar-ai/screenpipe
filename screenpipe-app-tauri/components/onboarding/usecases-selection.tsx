import React from "react";
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

interface OnboardingSelectionProps {
  className?: string;
  selectedOptions: string[] | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OPTIONS = [
  {
    key: "personalUse",
    icon: UserRound,
    label: "personal use",
    description:
      "personal knowledge management, productivity, custom dev, etc.",
  },
  {
    key: "professionalUse",
    icon: BriefcaseBusiness,
    label: "professional use",
    description:
      "out of the box productivity, meeting summaries, automation, etc.",
  },
  {
    key: "developmentlUse",
    icon: Wrench,
    label: "development purpose",
    description:
      "integrate in your business product, build on top, resell, etc.",
  },
  {
    key: "otherUse",
    icon: SlidersHorizontal,
    label: "other",
    description: "", // TODO editable
  },
];

const SelectionItem: React.FC<{
  option: (typeof OPTIONS)[number];
  isSelected: boolean | undefined;
  onClick: () => void;
}> = ({ option, isSelected, onClick }) => {
  const { icon: Icon, label, description } = option;
  return (
    <div
      className={`w-[90%] flex items-center border prose prose-sm rounded-lg m-[10px] px-4 py-[10px] hover:bg-accent cursor-pointer
        ${
          isSelected
            ? "bg-primary text-primary-foreground transition duration-300 hover:bg-primary/90"
            : ""
        }`}
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

const OnboardingSelection: React.FC<OnboardingSelectionProps> = ({
  className,
  selectedOptions,
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
}) => {
  const handleNext = () => {
    // Track selected options in Posthog
    posthog.capture("onboarding_usecases_selected", {
      selected_options: selectedOptions,
    });

    // Call the original handleNextSlide function
    handleNextSlide();
  };

  return (
    <div className={`${className} flex flex-col h-full`}>
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
        {OPTIONS.map((option) => (
          <SelectionItem
            key={option.key}
            option={option}
            isSelected={selectedOptions?.includes(option.key)}
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
