import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Brain,
  CircleCheck,
  Search,
  Calendar,
  Users,
  MessageSquare,
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
    key: "findInfo",
    icon: Search,
    label: "Find information quickly",
    description: "Search through your recorded activities and conversations",
    example: '"What was discussed in my morning meeting?"'
  },
  {
    key: "meetingSummaries",
    icon: Users,
    label: "Get meeting summaries",
    description: "Automatically summarize meetings and conversations",
    example: '"Summarize my call with the client yesterday"'
  },
  {
    key: "rememberContext",
    icon: Brain,
    label: "Remember context",
    description: "Recall details about projects, decisions, and conversations",
    example: '"What was the reason we chose option A?"'
  },
  {
    key: "trackActivities",
    icon: Calendar,
    label: "Track daily activities",
    description: "See how you spend your time and improve productivity",
    example: '"How much time did I spend coding today?"'
  }
];

const SelectionItem: React.FC<{
  option: (typeof OPTIONS)[number];
  isSelected: boolean | undefined;
  onClick: () => void;
  index: number;
}> = ({ option, isSelected, onClick, index }) => {
  const { icon: Icon, label, description, example } = option;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`w-full max-w-md flex flex-col border rounded-xl p-4 m-2 hover:shadow-lg cursor-pointer transition-all duration-300
        ${
          isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-lg transform scale-105"
            : "bg-card hover:bg-accent"
        }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <Icon className={`h-5 w-5 mr-3 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
          <span className="font-medium">{label}</span>
        </div>
        {isSelected && <CircleCheck className="h-5 w-5 flex-shrink-0" />}
      </div>
      
      <p className={`text-sm mb-2 ${isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
        {description}
      </p>
      
      <div className={`text-xs italic ${isSelected ? 'text-primary-foreground/75' : 'text-muted-foreground/75'} bg-opacity-20 rounded p-2 ${isSelected ? 'bg-white/10' : 'bg-muted/50'}`}>
        <MessageSquare className="h-3 w-3 inline mr-1" />
        {example}
      </div>
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
      <DialogHeader className="flex flex-col px-2 justify-center items-center mb-6">
        <motion.img
          className="w-20 h-20 justify-center mb-4"
          src="/128x128.png"
          alt="openrewind-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <DialogTitle className="text-center text-2xl font-bold">
          What would you like to do with your recorded data?
        </DialogTitle>
        <p className="text-center text-muted-foreground mt-2">
          Select the features that interest you most (you can choose multiple)
        </p>
      </DialogHeader>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
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
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            Great! We&apos;ll customize your experience for these features.
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
