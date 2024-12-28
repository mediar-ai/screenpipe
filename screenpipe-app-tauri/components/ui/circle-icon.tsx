import { forwardRef, useState } from "react";
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedCircleBorder } from "./animated-circle-border";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

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
            duration: 2 
          }
        }
    },
};

const circleAnimations = {
    hidden: { 
        boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)'
    },
    visible: { 
        boxShadow: '0px 0px 20px -13px rgba(0,0,0,0.8)',
        transition: {
        duration: 0.3,
          ease: "easeInOut"
        }
    }
};

export const CircleIcon = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode, state?: string }
>(({ state, className, children }, ref) => {
const [rendered, setRendered] = useState(false)
  return (
    <motion.div
        ref={ref}
        data-state={state}
        className={cn(
            "relative z-10 flex w-[50px] h-[50px] transition duration-1000 items-center justify-center rounded-full bg-white p-3 data-[state=healthy]:bg-[#cece66] data-[state=checking]:bg-[#FFCE00] data-[state=requesting]:bg-[#FFCE00] data-[state=pending]:bg-[#FFCE00] data-[state=unhealthy]:bg-[#E8292E] data-[state=skipped]:bg-input",
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
        {state === 'requesting' || state === 'checking' 
          ? <div className="h-[35px] w-[35px]">
              <Spinner/> 
            </div>
          : children
        }
      </motion.span>
    </motion.div>
  );
});