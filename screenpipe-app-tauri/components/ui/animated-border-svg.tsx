import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
const draw = {
    hidden: { 
      strokeWidth: '10px',
      pathLength: 0, 
      transition: {
        pathLength: {
          duration: 2
        },
        opacity: {
          duration: 2.5
        }
      }
    },
    visible: {
        opacity: 1,
        pathLength: 1,
        strokeWidth: '20px',
        transition: {
          pathLength: { 
            type: "spring", 
            duration: 2, 
            bounce: 0 
          },
          opacity: { 
            duration: 2 }
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
  
  
  export function AnimatedBorderSvg(props: {
    viewBox?: string,
    className: string
    rendered: boolean,
    setRendered: React.Dispatch<React.SetStateAction<boolean>>
  }) {
    return (
      <motion.svg
        viewBox={props.viewBox ?? "0 0 600 600"}
        className={cn('absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2  w-[100%] h-[100%]', props.className)}
        initial="hidden"
        animate="visible"
        onAnimationComplete={() => props.setRendered(true)}
        exit="fade"
      >
        <motion.rect
          className="w-full h-full"
          fill="white"
          rx="25" 
          stroke="#e4e4e7"
          variants={draw}
        />
      </motion.svg>
    )
  }