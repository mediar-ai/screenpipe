import React from "react";
import {
  Brain,
  CircleCheck,
  Zap,
  Shield,
  Settings,
} from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";
import { motion } from "framer-motion";

interface OnboardingPersonalizeProps {
  className?: string;
  selectedPersonalization: string | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OPTIONS = [
  {
    key: "maxAI",
    icon: Brain,
    label: "Maximum AI assistance",
    description: "Full AI analysis with cloud processing for best results",
    features: ["Best search accuracy", "Real-time analysis", "Advanced summaries"],
    recommended: true
  },
  {
    key: "balancedAI", 
    icon: Zap,
    label: "Balanced AI assistance",
    description: "Good AI analysis with some local processing",
    features: ["Good search accuracy", "Periodic analysis", "Basic summaries"],
    recommended: false
  },
  {
    key: "minimalAI",
    icon: Shield,
    label: "Minimal AI assistance",
    description: "Basic analysis with local processing only",
    features: ["Basic search", "Manual triggers", "Data stays local"],
    recommended: false
  }
];

const SelectionItem: React.FC<{
  option: (typeof OPTIONS)[number];
  isSelected: boolean | undefined;
  onClick: () => void;
  index: number;
}> = ({ option, isSelected, onClick, index }) => {
  const { icon: Icon, label, description, features, recommended } = option;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`relative w-full max-w-sm flex flex-col border rounded-xl p-6 m-2 hover:shadow-lg cursor-pointer transition-all duration-300
        ${
          isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-lg transform scale-105"
            : "bg-card hover:bg-accent"
        }`}
      onClick={onClick}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-orange-500 text-white text-xs px-3 py-1 rounded-full font-medium">
            Recommended
          </span>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-4">
        <Icon className={`h-8 w-8 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
        {isSelected && <CircleCheck className="h-6 w-6 flex-shrink-0" />}
      </div>
      
      <h3 className="font-semibold text-lg mb-2">{label}</h3>
      
      <p className={`text-sm mb-4 ${isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
        {description}
      </p>
      
      <div className="space-y-2">
        {features.map((feature, featureIndex) => (
          <div key={featureIndex} className="flex items-center text-sm">
            <div className={`w-2 h-2 rounded-full mr-2 ${isSelected ? 'bg-primary-foreground/60' : 'bg-primary/60'}`} />
            <span className={isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'}>
              {feature}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const OnboardingPersonalize: React.FC<OnboardingPersonalizeProps> = ({
  className,
  selectedPersonalization,
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
}) => {
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
          Choose your AI assistance level
        </h2>
        <p className="text-center text-muted-foreground mt-2 max-w-md">
          screenpipe uses AI to help you find and understand your recorded data. Choose how much AI assistance you&apos;d like.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex flex-wrap justify-center gap-4 max-w-6xl">
          {OPTIONS.map((option, index) => (
            <SelectionItem
              key={option.key}
              option={option}
              isSelected={selectedPersonalization === option.key}
              onClick={() => handleOptionClick(option.key)}
              index={index}
            />
          ))}
        </div>
        
        {selectedPersonalization && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 text-center text-sm text-muted-foreground max-w-md"
          >
            <Settings className="h-4 w-4 inline mr-1" />
            You can always change this setting later in preferences.
          </motion.div>
        )}
      </div>

      <OnboardingNavigation
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="Back"
        nextBtnText="Continue"
      />
    </div>
  );
};

export default OnboardingPersonalize;
