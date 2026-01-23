import React from "react";
import {
  Brain,
  CircleCheck,
  Search,
  Calendar,
  Code,
  Shield,
  Sparkles,
} from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";
import posthog from "posthog-js";
import { motion } from "framer-motion";

interface OnboardingSelectionProps {
  className?: string;
  selectedOptions: string[] | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OPTIONS = [
  {
    key: "memory",
    icon: Brain,
    label: "personal memory",
    description: "i forget things and want to search my past screen activity",
  },
  {
    key: "meetings",
    icon: Calendar,
    label: "meeting summaries",
    description: "i need help remembering what was discussed in meetings",
  },
  {
    key: "productivity",
    icon: Search,
    label: "productivity tracking",
    description: "i want to understand how i spend my time on my computer",
  },
  {
    key: "developer",
    icon: Code,
    label: "building/developing",
    description: "i'm a developer and want to build on top of screenpipe",
  },
  {
    key: "privacy",
    icon: Shield,
    label: "privacy-focused alternative",
    description: "i want a local/private alternative to cloud services",
  },
  {
    key: "curious",
    icon: Sparkles,
    label: "just curious",
    description: "trying it out to see what it does",
  },
];

const SelectionItem: React.FC<{
  option: (typeof OPTIONS)[number];
  isSelected: boolean | undefined;
  onClick: () => void;
  index: number;
}> = ({ option, isSelected, onClick, index }) => {
  const { icon: Icon, label, description } = option;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`w-full flex flex-col border rounded-xl p-4 hover:shadow-lg cursor-pointer transition-all duration-300
        ${
          isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-lg transform scale-105"
            : "bg-card hover:bg-accent"
        }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center">
          <Icon className={`h-5 w-5 mr-3 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
          <span className="font-medium">{label}</span>
        </div>
        {isSelected && <CircleCheck className="h-5 w-5 flex-shrink-0" />}
      </div>

      <p className={`text-sm ${isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
        {description}
      </p>
    </motion.div>
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
      <div className="flex flex-col px-2 justify-center items-center mb-6">
        <motion.img
          className="w-20 h-20 justify-center mb-4"
          src="/128x128.png"
          alt="screenpipe-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <h2 className="text-center text-2xl font-bold">
          what brought you to screenpipe?
        </h2>
        <p className="text-center text-muted-foreground mt-2">
          help us understand what you&apos;re looking for (select all that apply)
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl w-full px-4">
          {OPTIONS.map((option, index) => (
            <SelectionItem
              key={option.key}
              option={option}
              isSelected={selectedOptions?.includes(option.key)}
              onClick={() => handleOptionClick(option.key)}
              index={index}
            />
          ))}
        </div>

        {selectedOptions && selectedOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-center text-sm text-muted-foreground"
          >
            Thanks! This helps us improve Screenpipe for you.
          </motion.div>
        )}
      </div>

      <OnboardingNavigation
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNext}
        prevBtnText="Back"
        nextBtnText="Continue"
      />
    </div>
  );
};

export default OnboardingSelection;
