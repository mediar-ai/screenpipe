import { forwardRef, useState } from "react"
import { AnimatePresence, motion } from 'framer-motion';
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedBorder } from "@/components/ui/animated-border";

export const ScreenPipeLogo = forwardRef<HTMLDivElement, { init?: boolean }>(({ init }, ref) => {
  const [start, setStart] = useState(false)
  return (
    <motion.span
        layoutId="screenpipe-logo-container"
    >
      <div ref={ref} className="relative z-[100] bg-white w-[200px] h-[200px] rounded-lg">
          {start && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: "spring" }}
                className="rounded-lg"
              >
                  <BorderBeam className="z-[10]" duration={0.3} />
              </motion.div>
          )}
          <AnimatePresence>
              {init && <AnimatedBorder/>}
          </AnimatePresence>
          <img
              className="relative !w-[200px] !h-[200px] z-[15]"
              src="/Square310x310Logo.png"
              alt="Logo"
          />
      </div>
    </motion.span>
  );
});