import { motion } from 'framer-motion';
import TypingAnimation from './typing-animation';

export function ConversationBox(props: {
  setIsTypingDone?: any, 
  init?: boolean,
  className?: string
}) {
    return (
      <motion.span
        className={props.className}
        layoutId="screenpipe-textbox"
      >
        <motion.div 
            initial={{ opacity: props.init ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "spring", duration: 500}}
            className="w-[400px] bg-white flex flex-col space-y-1 min-h-[50px] p-5 border rounded-[20px]"
        >
          <h1 className="text-[1.2vw] font-bold">
            screenpipe
          </h1>
          <TypingAnimation
            duration={15}
            className="text-[1vw] font-light text-left"
            text="welcome to screenpipe! this onboarding guide will walk you through the essentials, so you can hit the ground running and make the most of screenpipe."
            isDone={
              () => props.setIsTypingDone 
              ? props.setIsTypingDone(true) 
              : null
            }
          />
        </motion.div>
      </motion.span>
    )
}