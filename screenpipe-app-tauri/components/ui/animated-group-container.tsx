import { cn } from "@/lib/utils"
import { AnimatePresence } from "framer-motion"
import { forwardRef, ReactNode, useEffect, useState } from "react"
import { AnimatedBorder } from "./animated-border"

export const AnimatedGroupContainer = forwardRef<
    HTMLDivElement,
    {
        children: ReactNode,
        isRectangle?: boolean,
        className: string
    }>(({
    children,
    isRectangle,
    className
}, ref) => {
    const [isActive, setIsActive] = useState(false)

    useEffect(() => {
        setTimeout(() => setIsActive(true), 1000)
    },[])

    return (
        <div ref={ref} className={cn(`relative flex z-[9] rounded-lg p-4 flex-col items-center justify-between`, className)}>
            <AnimatePresence>
                {isActive && <AnimatedBorder viewBox={isRectangle ? "0 0 600 1800" : undefined} />}
            </AnimatePresence>
            {children}
        </div>
    )
})

