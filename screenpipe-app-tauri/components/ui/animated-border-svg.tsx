import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const svgPathAnimations = {
  hidden: { 
    opacity:0,
    strokeWidth: '10px',
    pathLength: 0,
    transition: {
      pathLength: {
        duration: 2
      },
      opacity: {
        duration: 2.5
      },
    }
  },
  visible: {
      opacity: 1,
      pathLength: 1,
      strokeWidth: '20px',
      color: 'white',
      transition: {
        pathLength: { 
          type: "spring", 
          duration: 3, 
          bounce: 0 
        },
        opacity: { 
          duration: 2 
        }
      }
  },
  fade: {
    opacity: 0,
    pathLength: 1,
    strokeWidth: '1px',
    transition: {
        opacity: {
            duration: 2
        }
    }
  }
};

type AnimatedBorderSvgProps = {
  /**
   * @default "0 0 600 600"
   * @description exposed to easily allow the svg border to fit a rectangle if needed.
  */
  viewBox?: string,
  /**
   * @description mainly exposed to allow for positioning and z-indexing.
  */
  className: string
  /**
   * @description required function to notify parent when rendering was completed.
  */
  setRendered: React.Dispatch<React.SetStateAction<boolean>>,
  /**
   * @description sets type of exit animation. if true svg will undraw itself. 
  */
  undrawSVG?: boolean,
}
  
/**
 * 
 * @description renders an svg path that deliniates its parents bounds. svg path is drawn and then exits by fading or undrawing.
 * meant to fade upon completion because svg borders cant be properly rounded on a transparent background.
 */
export function AnimatedBorderSvg(props: AnimatedBorderSvgProps) {
  return (
    <motion.svg
      viewBox={props.viewBox ?? "0 0 600 600"}
      className={cn('absolute top-1/2 left-1/2 transform transition duration-500 -translate-x-1/2 -translate-y-1/2  w-[100%] h-[100%]', props.className)}
      initial={props.undrawSVG ? "visible" : "hidden"}
      animate={"visible"}
      fill={'currentColor'}
      onAnimationComplete={() => props.setRendered(true)}
      exit={props.undrawSVG ? "hidden" : "fade"}
    >
      <motion.rect
        className="w-full h-full bg-transparent"
        rx="25" 
        stroke={'#e4e4e7'}
        variants={svgPathAnimations}
      />
    </motion.svg>
  )
}