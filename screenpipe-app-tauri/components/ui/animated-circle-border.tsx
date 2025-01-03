import { motion } from 'framer-motion';

const animations = {
    hidden: { 
      strokeWidth: '2px',
      pathLength: 0, 
      opacity: 0,
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
        pathLength: 1,
        strokeWidth: '2px',
        opacity: 1,
        transition: {
          pathLength: { 
            // delay, 
            type: "spring", 
            duration: 2, 
            bounce: 0 
          },
          opacity: { 
            // delay, 
            duration: 2 }
        }
    },
    fade: {
        opacity: 0,
        pathLength: 1,
        strokeWidth: '2px',
        transition: {
            opacity: {
                duration: 1
            }
        }
    }
};

export function AnimatedCircleBorder(props: {
    rendered: boolean,
    setRendered: React.Dispatch<React.SetStateAction<boolean>>
}) {
    
    return (
      <motion.svg
        viewBox="0 0 100 100"
        className={'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2  w-[100%] h-[100%] rounded-lg'}
        initial="hidden"
        animate={"visible"}
        onAnimationComplete={() => props.setRendered(true)}
        exit="fade"
      >
       <motion.circle
          cx="50"
          cy="50"
          r="48"
          stroke="#b8b9ba"
          fill="none"
          variants={animations}
          custom={1}
        />
      </motion.svg>
    )
  }