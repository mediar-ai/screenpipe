import { AnimatePresence, motion } from 'framer-motion';
import useConvoBoxButtonGroup from "./button-group.hook";
import ButtonProxy from "./button-proxy";
import { Button } from "@/components/ui/button";
import { ConversationBoxMachineType } from '@/features/system-atlas/state-machines/conversation-box';
import { introAnimation } from '@/lib/motion/constants';

export default function ConvoBoxButtonGroup({convoBoxMachine} : {
    convoBoxMachine: ConversationBoxMachineType
}) {
    const {
        isButtonGroupHidden, 
        buttons, 
        isDisabled,
        isLoading,
        sendEvent, 
        skipEvent,
        isStepSkippable
    } = useConvoBoxButtonGroup(convoBoxMachine)


    return (
            <>
            <div className="space-y-2">
                <AnimatePresence>
                    {!isButtonGroupHidden && (
                        buttons.map((button) => 
                            <motion.div 
                                key={button.label}
                                initial='hidden'
                                animate='visible'
                                exit='hidden'
                                variants={introAnimation}
                            >
                                <ButtonProxy
                                    button={button}
                                    isDisabled={isDisabled}
                                    isLoading={isLoading}
                                    sendEvent={sendEvent}
                                />
                            </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <AnimatePresence>
                {(isStepSkippable && !isLoading && !isDisabled && !isButtonGroupHidden) &&   
                    <motion.span
                        initial='hidden'
                        animate='visible'
                        exit='hidden'
                        variants={introAnimation}
                        className="min-w-[80px] w-full"
                    >
                        <Button
                            variant={'ghost'}
                            size={'sm'}
                            className="min-w-[80px] h-[20px] mt-[7px] w-full  opacity-50"
                            onClick={skipEvent}
                        >
                            skip
                        </Button>
                    </motion.span>
                }
            </AnimatePresence>
        </>
    )
}