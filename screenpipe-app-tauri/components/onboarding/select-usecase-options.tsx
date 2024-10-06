import React  from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserRound, CircleCheck, BriefcaseBusiness, Wrench, SlidersHorizontal } from "lucide-react";
import OnboardingNavigation from "@/components/onboarding/navigation";

interface OnboardingSelectionProps {
  error: string | null;
  className?: string;
  selectedOptions: string[] | null;
  handleOptionClick: (option: string) => void;
  handleNextSlide: () => void;
  handlePrevSlide: () => void;
}

const OnboardingSelection: React.FC<OnboardingSelectionProps> = ({ 
  className, 
  selectedOptions,
  handleOptionClick,
  handleNextSlide,
  handlePrevSlide,
  error,
}) => {

  return (
    <>
      <DialogHeader className={` flex justify-center items-center ${className}`}>
        <div className="w-full inline-flex justify-center">
          <img src="/128x128.png" alt="screenpipe-logo" width="72" height="72"/>
        </div>
        <DialogTitle className="font-bold text-[30px] text-balance">
        What are you planning to use the Screepipe for?
      </DialogTitle>
      </DialogHeader>
        <div className="flex relative mt-8 justify-center items-center flex-col">
          <span className="text-[15px] w-full ml-24 text-left text-muted-foreground ">
          You can select multiple option for this:
          </span>
          <div 
            className={`w-[90%] flex items-center border prose prose-sm rounded-lg m-4 px-4 py-[10px] hover:bg-accent cursor-pointer 
                      ${selectedOptions?.includes('personalUse') ? 'bg-primary text-primary-foreground hover:bg-primary/90 transition duration-300' : ''}`}
            onClick={() => handleOptionClick('personalUse')}
          >
            <span className="float-left">
              <UserRound className="inline h-4 w-4 mr-2" />
              Personal Use <span className="text-[12px]">(daily summary &amp; educational material organization)</span>
            </span>
            {selectedOptions?.includes('personalUse') && <CircleCheck className="inline h-4 w-4 ml-auto" />}
          </div>
          <div 
            className={` w-[90%] flex items-center border prose prose-sm rounded-lg mx-4 px-4 py-[10px] hover:bg-accent cursor-pointer 
                      ${selectedOptions?.includes('professionalUse') ? 'bg-primary text-primary-foreground hover:bg-primary/90 transition duration-300' : ''}` }
            onClick={() => handleOptionClick('professionalUse')}
          >
            <span className="float-left">
              <BriefcaseBusiness className="inline h-4 w-4 mr-2" />
              Professional Use <span className="text-[12px]">(productivity tracking &amp; meeting summaries)</span>
            </span>
            {selectedOptions?.includes('professionalUse') && <CircleCheck className="inline h-4 w-4 ml-auto" />}
          </div>
          <div 
            className={` w-[90%] flex items-center border prose prose-sm rounded-lg m-4 px-4 py-[10px] hover:bg-accent cursor-pointer 
                       ${selectedOptions?.includes('developmentlUse') ? 'bg-primary text-primary-foreground hover:bg-primary/90 transition duration-300' : ''} `}
            onClick={() => handleOptionClick('developmentlUse')}
          >
            <span className="float-left">
              <Wrench className="inline h-4 w-4 mr-2" />
              Development Purpose <span className="text-[12px]">(automate data capture &amp; create ai-powered workflows)</span>
            </span>
            {selectedOptions?.includes('developmentlUse') && <CircleCheck className="inline h-4 w-4 ml-auto" />}
          </div>
          <div 
            className={` w-[90%] border flex items-center rounded-lg m-4 mt-0 prose prose-sm px-4 py-[10px] hover:bg-accent cursor-pointer 
                        ${selectedOptions?.includes('otherUse') ? 'bg-primary text-primary-foreground hover:bg-primary/90 transition duration-300' : ''}`}
            onClick={() => handleOptionClick('otherUse')}
          >
            <span className="float-left">
              <SlidersHorizontal className="inline h-4 w-4 mr-2" />
              Other
            </span>
            {selectedOptions?.includes('otherUse') && <CircleCheck className="inline h-4 w-4 ml-auto" />}
          </div>
          {error && <div className="text-destructive absolute mt-2 bottom-[-20px]">{error}</div>}
        </div>
        <OnboardingNavigation
          className="mt-10"
          handlePrevSlide={handlePrevSlide}
          handleNextSlide={handleNextSlide}
          prevBtnText="Previous"
          nextBtnText="Next"
        />
      </>
  )
};

export default OnboardingSelection;

