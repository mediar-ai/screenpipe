import React from 'react';
import { Button } from '@/components/ui/button';

interface OnboardingNavigationProps {
  prevBtnText?: string,
  nextBtnText?: string,
  className?: string,
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingNavigation: React.FC<OnboardingNavigationProps> = ({ 
  nextBtnText = "",
  prevBtnText = "",
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  return (
    <div className={` flex justify-between mx-8 ${className}`}>
      <Button 
        className="w-fit min-w-32"
        variant={"outline"}
        onClick={handlePrevSlide}
      >
        {prevBtnText}
      </Button>
      <Button className="w-fit min-w-32" 
        onClick={handleNextSlide}
      >
        {nextBtnText}
      </Button>
    </div>
  );
} 
export default OnboardingNavigation;

