import { useState } from "react";
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedBorderSvg } from './animated-border-svg';
import { opacityVisibility } from "@/lib/motion/constants";

type AnimatedBorderType = {
  /**
   * @default "0 0 600 600"
   * @description exposed to easily allow the svg border to fit a rectangle if needed.
  */
  viewBox?: string
  /**
   * @description if true css border will be green. used to highlight component.
  */
  showGreenBorder?: boolean
  /**
   * @description if true border will be hidden. used to animate/activate border when required.
  */
  hidden?: boolean 

}

/**
 * @description will render a border that grows into the parent's bounds. it orchestrates the animation of 
 * an svg path and a css border. svg path makes it look like a line is being drawn around the parent's bounds, 
 * followed by a slight shine upon completion.
 */
export const AnimatedBorder = (props: AnimatedBorderType) => {
    const [isSVGRendered, setSVGRendered] = useState(false)
    const [isSVGUnrendered, setSVGUnrendered] = useState(false)
    const shouldRenderSVG = props.hidden ?  props.showGreenBorder && !isSVGRendered : !isSVGRendered
    const shouldUndraw = isSVGRendered && props.hidden && !props.showGreenBorder
    const shouldRenderDiv = isSVGRendered && !shouldUndraw
    
    function resetComponent(){
        setSVGUnrendered(true)
        setTimeout(()=>{
            if(props.hidden){
                setSVGRendered(false)
                setSVGUnrendered(false)
            }
        },1000)
    }
    return (
        <>
            <AnimatePresence>
                {shouldRenderDiv && 
                    <motion.div 
                        className="absolute top-0 z-[10] rounded-[6px] h-full border-[2px] border-input transition duration-500 w-full data-[isactive=true]:bg-white data-[isactive=true]:border-[#cece66] data-[isactive=true]:border-[2px]"
                        data-isactive={props.showGreenBorder}
                        initial="hidden"
                        animate={'visible'}
                        exit='hidden'
                        variants={opacityVisibility}
                    />
                }
                {shouldRenderSVG &&
                    <AnimatedBorderSvg
                        key={'draw'}
                        setRendered={setSVGRendered}
                        className="rounded-[6px] z-[10]"
                        viewBox={props.viewBox}
                    />
                } 
                {(!isSVGUnrendered && shouldUndraw) &&
                    <AnimatedBorderSvg
                        key={'undraw'}
                        undrawSVG
                        setRendered={()=>resetComponent()}
                        className="rounded-[6px]"
                        viewBox={props.viewBox}
                    />
                }
            </AnimatePresence>
        </>
    )
}