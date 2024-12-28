import { ActorRef } from "xstate"
import { useSelector } from "@xstate/react"
import { Ref } from "react"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"
import { OpenAiIcon } from "@/components/icons/open-ai"
import { OllamaIcon } from "@/components/icons/ollama"
import { PerplexityIcon } from "@/components/icons/perplexity"
import { MixtralIcon } from "@/components/icons/mixtral"

const LlmModelsStatus = (props: {
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
                className={'bg-white rounded-lg h-[130px] w-[130px] place-items-center grid grid-rows-2 grid-cols-2 gap-2 p-2'}
            >
                <CircleIcon
                    state={deviceStates.openai}
                >
                    <OpenAiIcon/>
                </CircleIcon>
                <CircleIcon
                    state={deviceStates.llama}
                >
                    <OllamaIcon/>
                </CircleIcon>
                <CircleIcon
                    state={deviceStates.perplexity}
                >
                    <PerplexityIcon/>
                </CircleIcon>
                <CircleIcon
                    state={deviceStates.mixtral}
                >
                    <MixtralIcon/>
                </CircleIcon>
            </AnimatedGroupContainer>
        </span>
    )
}

export default LlmModelsStatus