import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnboardingNavigation from '@/components/onboarding/navigation';
import { Info } from "lucide-react";

interface OnboardingExperimentalFeaturesProps {
  className?: string,
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingExperimentalFeatures: React.FC<OnboardingExperimentalFeaturesProps> = ({ 
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  return (
    <div className={`${className} w-full flex justify-center flex-col`}>
      <DialogHeader className="px-2">
        <div className="w-full inline-flex justify-center">
          <img
            src="/128x128.png"
            alt="screenpipe-logo"
            width="72"
            height="72"
          />
        </div>
        <DialogTitle className="text-center font-bold text-[32px] text-balance flex justify-center">
          Features of Screenpipe
        </DialogTitle>
        <h1 className="font-medium text-center text-md prose">
          Screenpipe hasn&apos;t been extensively tested. we&apos;d love your feedback!
        </h1>
      </DialogHeader>
      <div className="mt-4 w-full flex justify-around flex-row relative">
        <Card className="w-[45%]">
          <CardContent className="mt-4">
            <h1 className="font-semibold text-lg">Essential features:</h1>
              <ul className="list-disc ml-5">
                <li className="text-muted-foreground text-sm">
                  <span className="font-medium text-nowrap text-[14px] prose mr-1">
                      Continuous media capture: 
                  </span>
                  Seamlessly records screen and audio data 24/7, storing everything locally
                </li>
                <li className="text-muted-foreground text-sm">
                  <span className="font-medium text-nowrap text-[14px] prose mr-1">
                    Personalized AI integration:
                  </span>
                    Empowers AI models with insights derived from your captured data.
                </li>
                <li className="text-muted-foreground text-sm">
                  <span className="font-medium text-[14px] prose mr-1">
                    Open source &amp; secure:
                  </span>
                    Ensures your data remains private, giving you full control over storage and processing.
                </li>
              </ul>
          </CardContent>
        </Card>
        <Card className="w-[45%]">
          <CardContent className="mt-4">
            <h1 className="font-semibold text-lg">Experimental features:</h1>
              <ul className="list-disc ml-5">
                <li className="text-muted-foreground text-sm">
                  <span className="font-medium text-nowrap text-[14px] prose mr-1">
                    Remove personal information (PII):
                  </span>
                    For automatically detecting and removing your personally identifiable information (PII) from captured data to ensure your privacy  with data
                    protection.
                </li>
                <li className="text-muted-foreground text-sm mt-2">
                  <span className="font-medium text-nowrap text-[14px] prose mr-1">
                    Restart interval:
                  </span>
                    It&apos;s an experimental setting that lets you set an automatic restart interval to refresh processes or clear cached data, ensuring optimized performance.
                </li>
              </ul>
          </CardContent>
        </Card>
      </div>
      <span className="absolute bottom-14 text-muted-foreground prose-sm text-center block w-full">
       <Info className="inline w-4 h-4 mb-[1px]" /> Be careful with experimental features!
      </span>
      <OnboardingNavigation 
        className="mt-10"
        handlePrevSlide={handlePrevSlide}
        handleNextSlide={handleNextSlide}
        prevBtnText="Previous"
        nextBtnText="Let&apos;s get started"
      />
    </div>
  );
} 

export default OnboardingExperimentalFeatures;

