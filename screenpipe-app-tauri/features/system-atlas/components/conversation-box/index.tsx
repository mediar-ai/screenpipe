import { useSelector } from "@xstate/react"
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { screenpipeOnboardingMachine } from "@/features/onboarding/state-machine/onboarding-flow";
import { ConversationBoxMachineType } from "../../state-machines/conversation-box";
import { TextBox } from "./text-box";
import ConvoBoxButtonGroup from "./button-group";

function useConvoBox() {
    const convoBoxMachine: ConversationBoxMachineType = useMemo(() => {
        return screenpipeOnboardingMachine.system.get('convoBoxMachine')
    },[])

    const layout = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.context.layout
    })

    return { convoBoxMachine, layout }
}

export default function ConversationBox({
    className
} : {
    className?: string
}){
    const {convoBoxMachine, layout} = useConvoBox()

    return(
        <div
            data-direction={layout}
            className={cn("transition duration-[1000ms] flex data-[direction=vertical]:flex-col data-[direction=vertical]:space-y-4 data-[direction=horizontal]:flex-row data-[direction=horizontal]:space-x-4 items-center justify-center", className)} 
        >
            <TextBox
                init 
                convoBoxMachine={convoBoxMachine}
            />
            
            <div 
                className="relative flex flex-col [&>button+button]:space-y-3 items-center justify-center min-w-[70px] min-h-[50px]"
            >
                <ConvoBoxButtonGroup
                    convoBoxMachine={convoBoxMachine}
                />
            </div>
        </div>
    )
}