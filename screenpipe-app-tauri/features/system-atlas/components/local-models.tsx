import { ActorRef } from "xstate"
import { useSelector } from "@xstate/react"
import { Ref } from "react"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"
import WhisperIcon from "@/components/icons/whisper-huggingface"
import OnnxGithubIcon from "@/components/icons/onnx-github"

const LocalModels = (props: {
    llmModelsRef: Ref<HTMLDivElement> | null,
    className: string,
    actorRef: ActorRef<any,any,any>,
    isContainerActive?: boolean
}) => { 
    const deviceStates = useSelector(props.actorRef, (snapshot) => {
        return snapshot.context.ai
    })

    return (
        <span className={props.className}>
            <AnimatedGroupContainer
                color="#cece66"
                shouldScale={props.isContainerActive}
                ref={props.llmModelsRef} 
                className={'bg-white rounded-lg h-[65px] w-[130px] flex flex-row justify-around'}
            >
                <CircleIcon
                    state={deviceStates.openai}
                >
                    <WhisperIcon/>
                </CircleIcon>
                <CircleIcon
                    state={deviceStates.llama}
                >
                    <OnnxGithubIcon/>
                </CircleIcon>
            </AnimatedGroupContainer>
        </span>
    )
}

export default LocalModels