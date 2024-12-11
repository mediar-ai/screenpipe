import { useState } from "react";
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedBorderSvg } from "./animated-border-svg";

const animations = {
    hidden: { 
        opacity: 0
    },
    visible: { 
        opacity: 1,
        transition: {
            duration: 1,
        }
    }
};

export const AnimatedBorder = (props: 
    {
        viewBox?: string, 
        className?: string
    }
) => {
    const [rendered, setRendered] = useState(false)
    return (
        <>
            <motion.div className="absolute top-0 bg-white z-[10]
                rounded-lg h-full w-full border-[2px]"
                initial="hidden"
                animate={rendered ? 'visible' : undefined}
                variants={animations}
            />
            <AnimatePresence>
                { !rendered && 
                    <AnimatedBorderSvg
                        rendered={rendered}
                        setRendered={setRendered}
                        className="rounded-sm"
                        viewBox={props.viewBox}
                    />
                }
            </AnimatePresence>
        </>
    )
}