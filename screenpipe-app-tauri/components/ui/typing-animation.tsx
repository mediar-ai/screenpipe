"use client";

import { RefObject, useEffect, useImperativeHandle, useState } from "react";

import { cn } from "@/lib/utils";

interface TypingAnimationProps {
  className?: string;
  isAnimationComplete(): void;
  handle: RefObject<TypingAnimationHandle | null> ;
}

/**
 * @description handle exposes a function to configure typing animation imperatively.
 */
export type TypingAnimationHandle = {
  /**
   * @param text - text to type. required argument.
   * @param duration - duration between character render in ms. defaults to 200.
   * @description function configures typing animation imperatively.
   */
  configureTypingAnimation(args: {text: string, duration: number}): void
}

/**
 * @param className - h1 text styling.
 * @param isAnimationComplete - function called upon animation completion.
 * @param handle - react ref object that exposes a function to set/reset text to be typed.
 * @returns h1 react component that triggers a typing animation which can be configured by parent through its handle refrence object.
 */
export function TypingAnimation({
  handle, 
  className,
  isAnimationComplete,
}: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState<string>("");
  const [{textToType, duration}, setAnimationConfiguration] = useState<{textToType: string, duration: number}>({
    textToType: '',
    duration: 200
  })

  useEffect(() => {
    if (textToType && displayedText.length < textToType.length) {
        setTimeout(() => {
          setDisplayedText(
            textToType.slice(0, displayedText.length + 1)
          )
        }
      , duration)
    } else if (textToType) {
        isAnimationComplete()
    }

  }, [textToType, displayedText]);

  function configureTypingAnimation({
    text,
    duration
  }:{
    text: string,
    duration?: number
  }){
    setDisplayedText("")
    setAnimationConfiguration((currentConfig) => {
      return {
        textToType: text,
        duration: typeof duration === 'undefined' ? currentConfig.duration : duration
      }
    })
  }

  useImperativeHandle(handle, () => ({
    configureTypingAnimation
  }))

  return (
    <h1
      className={cn(
        "font-display transition-height duration-1000 text-center text-4xl font-bold leading-[5rem] tracking-[-0.02em] drop-shadow-sm",
        className,
      )}
    >
      {displayedText}
    </h1>
  );
}
