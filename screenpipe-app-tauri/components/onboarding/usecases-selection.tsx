import React, { useState, useEffect } from "react";
import {
  Brain,
  CircleCheck,
  Search,
  Calendar,
  Code,
  Shield,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";
import posthog from "posthog-js";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";

interface OnboardingSelectionProps {
  className?: string;
  selectedOption: string | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OPTIONS = [
  {
    key: "memory",
    icon: Brain,
    label: "find something i saw",
    description: "i saw something on my screen but can't remember where or when",
  },
  {
    key: "meetings",
    icon: Calendar,
    label: "remember conversations",
    description: "i want to recall what was said in meetings or calls",
  },
  {
    key: "productivity",
    icon: Search,
    label: "track my time",
    description: "i want to see how i actually spend time on my computer",
  },
  {
    key: "developer",
    icon: Code,
    label: "build with my data",
    description: "i'm a developer and want to build automations on my screen data",
  },
  {
    key: "privacy",
    icon: Shield,
    label: "local ai alternative",
    description: "i want a private, local alternative to cloud ai tools",
  },
  {
    key: "curious",
    icon: Sparkles,
    label: "just exploring",
    description: "i heard about screenpipe and want to see what it does",
  },
  {
    key: "other",
    icon: MessageSquare,
    label: "something else",
    description: "tell us in your own words",
  },
];

const SelectionItem: React.FC<{
  option: (typeof OPTIONS)[number];
  isSelected: boolean;
  onClick: () => void;
  index: number;
  children?: React.ReactNode;
}> = ({ option, isSelected, onClick, index, children }) => {
  const { icon: Icon, label, description } = option;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`w-full flex flex-col border rounded-xl p-4 hover:shadow-lg cursor-pointer transition-all duration-300
        ${
          isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-lg"
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

      {children}
    </motion.div>
  );
};

const OnboardingSelection: React.FC<OnboardingSelectionProps> = ({
  className,
  selectedOption,
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
}) => {
  const [otherText, setOtherText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Load saved selection and submission status on mount
  useEffect(() => {
    const savedOption = localStorage.getItem("onboarding_usecase");
    const savedOtherText = localStorage.getItem("onboarding_usecase_other");
    const submitted = localStorage.getItem("onboarding_usecase_submitted");

    if (savedOption && !selectedOption) {
      handleOptionClick(savedOption);
    }
    if (savedOtherText) {
      setOtherText(savedOtherText);
    }
    if (submitted === "true") {
      setHasSubmitted(true);
    }
  }, []);

  // Save selection when it changes
  useEffect(() => {
    if (selectedOption) {
      localStorage.setItem("onboarding_usecase", selectedOption);
    }
  }, [selectedOption]);

  // Save other text when it changes
  useEffect(() => {
    if (otherText) {
      localStorage.setItem("onboarding_usecase_other", otherText);
    }
  }, [otherText]);

  const isOtherSelected = selectedOption === "other";
  const canContinue = selectedOption !== null && (selectedOption !== "other" || otherText.trim().length > 0);

  const handleNext = () => {
    // Only track to PostHog once to avoid spam
    if (!hasSubmitted) {
      posthog.capture("onboarding_usecases_selected", {
        selected_option: selectedOption,
        other_text: isOtherSelected ? otherText.trim() : null,
      });
      localStorage.setItem("onboarding_usecase_submitted", "true");
      setHasSubmitted(true);
    }

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
          what&apos;s your #1 goal with screenpipe?
        </h2>
        <p className="text-center text-muted-foreground mt-2">
          pick the one that matters most to you
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl w-full px-4">
          {OPTIONS.map((option, index) => (
            <SelectionItem
              key={option.key}
              option={option}
              isSelected={selectedOption === option.key}
              onClick={() => handleOptionClick(option.key)}
              index={index}
            >
              {option.key === "other" && selectedOption === "other" && (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      type="text"
                      placeholder="what are you trying to do?"
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      className="bg-background text-foreground border-primary-foreground/30 placeholder:text-primary-foreground/50"
                      autoFocus
                    />
                  </motion.div>
                </AnimatePresence>
              )}
            </SelectionItem>
          ))}
        </div>

        <AnimatePresence>
          {!selectedOption && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center text-sm text-muted-foreground"
            >
              this helps us build the right features for you
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <OnboardingNavigation
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNext}
        prevBtnText="Back"
        nextBtnText="Continue"
        nextDisabled={!canContinue}
      />
    </div>
  );
};

export default OnboardingSelection;
