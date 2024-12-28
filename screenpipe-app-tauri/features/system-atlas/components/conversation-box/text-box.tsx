import { motion } from 'framer-motion';
import { useEffect, useRef } from "react";
import { ActorRef } from 'xstate';
import { shallowEqual, useSelector } from '@xstate/react';
import { cn } from '@/lib/utils';
import { TypingAnimation, TypingAnimationHandle } from '@/components/ui/typing-animation';

function useConvoBoxTextBox(
    convoBoxMachine: ActorRef<any,any,any>,
) {
    const textBox = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.context.textBox
    }, shallowEqual)

    return { ...textBox }
}

export function TextBox(props: {
  init?: boolean,
  className?: string,
  convoBoxMachine: ActorRef<any,any,any>
}) {
    const typingAnimationHandle = useRef<TypingAnimationHandle>(null)
    const { text } = useConvoBoxTextBox(props.convoBoxMachine)

    function onAnimationComplete() {
      setTimeout(()=>props.convoBoxMachine.send({type: "TYPING_ANIMATION_DONE"}),200)
  }

    useEffect(() => {
        if ( text ) {
            typingAnimationHandle.current?.configureTypingAnimation({text, duration: 15})
        }
    },[text])

    return (
      <motion.span
        layoutId="screenpipe-textbox"
        className={cn('relative z-[1000]',props.className)}
      >
        <motion.div 
            layout
            initial={{ opacity: props.init ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "spring", duration: 500}}
            className="w-[420px] flex flex-col space-y-2 p-5 border rounded-[20px] bg-background"
        >
          <h1 className="font-bold">
           screenpipe
          </h1>
          <TypingAnimation
            handle={typingAnimationHandle}
            isAnimationComplete={() => onAnimationComplete()}
            className="text-[1vw] font-light text-left"
          />
        </motion.div>
      </motion.span>
    )
}