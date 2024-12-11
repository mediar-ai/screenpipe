import { Keyboard, Mic, Monitor } from "lucide-react"
import { Ref } from "react"
import { cn } from "@/lib/utils"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"

const PermissionStatus = (props: {
    micRef?: Ref<HTMLDivElement> | null,
    keyboardRef?: Ref<HTMLDivElement> | null,
    monitorRef?: Ref<HTMLDivElement> | null,
    className?: string
}) => {
    return (
        <AnimatedGroupContainer isRectangle className={cn("h-[300px] w-[100px]",props.className)}>
            <CircleIcon ref={props.micRef}>
                <Mic className="h-4 w-4"/>
            </CircleIcon>
            <CircleIcon ref={props.keyboardRef}>
                <Keyboard className="h-4 w-4"/>
            </CircleIcon>
            <CircleIcon ref={props.monitorRef}>
                <Monitor className="h-4 w-4"/>
            </CircleIcon>
        </AnimatedGroupContainer>
    )
}

export default PermissionStatus