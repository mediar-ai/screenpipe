import { forwardRef, useState } from "react";
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedCircleBorder } from "./animated-circle-border";
import { cn } from "@/lib/utils";

const childrenAnimations = {
    hidden: { 
      opacity: 0,
      transition: {
        opacity: {
          duration: 2.5
        }
      }
    },
    visible: {
        opacity: 1,
        transition: {
          opacity: { 
            // delay, 
            duration: 2 }
        }
    },
};

const circleAnimations = {
    hidden: { 
        boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)' // Initial state
    },
    visible: { 
        boxShadow: '0px 0px 20px -13px rgba(0,0,0,0.8)', // Final state
        transition: {
        duration: 1, // Customize duration as needed
        ease: "easeInOut"
        }
    }
};

export const CircleIcon = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
const [rendered, setRendered] = useState(false)
  return (
    <motion.div
        ref={ref}
        className={cn(
            "relative z-10 flex w-[50px] h-[50px] items-center justify-center rounded-full bg-white p-3 ",
            className,
        )}
        initial="hidden"
        animate={rendered ? 'visible' : undefined}
        variants={circleAnimations}
    >
      <AnimatePresence>
        {!rendered && <AnimatedCircleBorder
            rendered={rendered}
            setRendered={setRendered}
        />}
      </AnimatePresence>
      <motion.span
        initial="hidden"
        animate={rendered ? 'visible' : undefined}
        variants={childrenAnimations}
      >
      {children}
      </motion.span>
    </motion.div>
  );
});