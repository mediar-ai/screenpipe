import { cn } from "@/lib/utils"
import { motion } from 'framer-motion';
import { forwardRef, ReactNode } from "react"
import { AnimatedBorder } from "./animated-border"

const scaleAnimations = {
    regularSize: { 
        scale: 1,
        transition: {
            duration: 1,
        }
    },
    grow: { 
        scale: 1.2,
        transition: {
            duration: 1,
        }
    }
};

export const AnimatedGroupContainer = forwardRef<
    HTMLDivElement,
    {
        children: ReactNode,
        className?: string,
        shouldScale?: boolean,
        color?: string,
        hiddenBorder?: boolean
    }>(({
        children,
        className,
        shouldScale,
        hiddenBorder
}, ref) => {

    return (
        <motion.div 
            id="scaler"
            ref={ref} 
            animate={shouldScale ? 'grow' : 'regularSize'}
            variants={scaleAnimations}
            data-isactive={shouldScale}
            className={cn(`relative flex z-[9] flex-col items-center justify-between`, className)}
        >
            <AnimatedBorder 
                showGreenBorder={shouldScale} 
                hidden={hiddenBorder}
            />
            {children}
        </motion.div>
    )
})