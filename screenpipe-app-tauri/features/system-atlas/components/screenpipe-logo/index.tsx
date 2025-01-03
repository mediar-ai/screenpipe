import { forwardRef } from "react"
import useScreenpipeLogo from "./hook";
import { AnimatePresence, motion } from 'framer-motion';
import { fadeAnimation, scaleAnimation } from "@/lib/motion/constants";
import { NeonGradientCard } from "@/components/ui/neon-gradient-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedBorder } from "@/components/ui/animated-border";

export const ScreenpipeLogo = forwardRef<
  HTMLDivElement,
  {hideBorder?: boolean}
>(({hideBorder}, ref) => {

  const {
    showNeonGradient,
    shouldExpand,
    showBorderBeam,
    showBorder,
    showGreenBorder,
    duration,
    strokeWidth,
    size
  } = useScreenpipeLogo()
  
  
  return (
    <motion.span
        layoutId="screenpipe-logo-container"
        animate={ shouldExpand ? 'shrinkExpand' : 'default'}
        className="relative z-[100]"
        variants={{...scaleAnimation}}
    >
      <div 
        ref={ref} 
        className="relative z-[100] !w-[200px] bg-background !h-[200px] rounded-[8px] flex justify-center items-center"
      >
        <AnimatePresence>
          {showNeonGradient && 
              <NeonGradientCard
                key={'neonGlow'}
                className="absolute z-[11]" 
                borderRadius={8}
                neonColors={{
                  firstColor:'#9c40ff',
                  secondColor:'#ffaa40'
                }}
              />
          } 
          {showBorderBeam && (
              <motion.div
                key={'borderBeam'}
                variants={fadeAnimation}
                initial={'fade'}
                animate={'default'}
                exit={'fade'}
                className="rounded-[8px]"
              >
                  <BorderBeam
                    className="z-[101]" 
                    size={size}
                    duration={duration}
                    borderWidth={strokeWidth}
                  />
              </motion.div>
          )}
          {(!hideBorder && showBorder) && 
            <AnimatedBorder 
              key={'animatedBorder'}
              showGreenBorder={showGreenBorder}
            />
          }
        </AnimatePresence>
        <img
            className="relative !w-[200px] !h-[200px] z-[150]"
            src="/Square310x310Logo.png"
            alt="Logo"
        />
      </div>
    </motion.span>
  );
});

export default ScreenpipeLogo