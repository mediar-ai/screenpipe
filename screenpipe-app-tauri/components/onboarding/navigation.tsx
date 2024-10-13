import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react'; // Importing icons

interface OnboardingNavigationProps {
  prevBtnText?: string,
  nextBtnText?: string,
  className?: string,
  isLoading?: boolean;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingNavigation: React.FC<OnboardingNavigationProps> = ({ 
  nextBtnText = "",
  prevBtnText = "",
  className = "",
  isLoading,
  handlePrevSlide,
  handleNextSlide,
}) => {
  return (
    <div className={`flex justify-between items-center mx-auto ${className} fixed bottom-0 left-20 right-20 p-4 bg-transparent max-w-screen-lg`}>
      <Button 
        className="flex items-center w-fit min-w-32 disabled:!cursor-not-allowed disabled:!pointer-events-auto"
        variant={"outline"}
        onClick={handlePrevSlide}
        disabled={isLoading}
      >
        <ArrowLeft className="mr-2" /> {/* Icon with margin */}
        {prevBtnText}
      </Button>
      <Button 
        className="flex items-center w-fit min-w-32 disabled:!cursor-not-allowed disabled:!pointer-events-auto" 
        onClick={handleNextSlide}
        disabled={isLoading}
      >
        {nextBtnText}
        <ArrowRight className="ml-2" /> {/* Icon with margin */}
      </Button>
    </div>
  );
} 
export default OnboardingNavigation;
