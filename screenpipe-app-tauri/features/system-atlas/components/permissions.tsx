import { Keyboard, MicIcon, Monitor } from "lucide-react"
import { Ref, useMemo } from "react"
import { cn } from "@/lib/utils"
import { ActorRef } from "xstate"
import { useSelector } from "@xstate/react"
import { PeripheralDevicesMachineType } from "../state-machines/peripheral-devices"
import { screenpipeOnboardingMachine } from "@/features/onboarding/state-machine/onboarding-flow"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"

const PermissionStatus = (props: {
    actorRef: ActorRef<any,any,any>,
    micRef?: Ref<HTMLDivElement> | null,
    keyboardRef?: Ref<HTMLDivElement> | null,
    monitorRef?: Ref<HTMLDivElement> | null,
    className?: string,
    isContainerActive?: boolean
}) => {
    const peripheralDevicesMachine: PeripheralDevicesMachineType  = useMemo(() => {
        return screenpipeOnboardingMachine.system.get('peripheralDevicesMachine')
    },[])

    const state = useSelector(peripheralDevicesMachine, (snap)=> snap.value)
    return (
        <AnimatedGroupContainer
            color="#cece66"
            hiddenBorder
            isRectangle 
            className={cn("h-[300px] w-[100px] p-2 py-4", props.className)}
            shouldScale={props.isContainerActive}
        >
            <CircleIcon
                state={state.mic}
                ref={props.micRef}
            >
                <MicIcon className="h-4 w-4"/>
            </CircleIcon>
            <CircleIcon
                state={state.accessibility}
                ref={props.keyboardRef}
            >
                <Keyboard className="h-4 w-4"/>
            </CircleIcon>
            <CircleIcon
                state={state.monitor}
                ref={props.monitorRef}
            >
                <Monitor className="h-4 w-4"/>
            </CircleIcon>
        </AnimatedGroupContainer>
    )
}

export default PermissionStatus