import { MixtralIcon } from "@/components/icons/mixtral"
import { OllamaIcon } from "@/components/icons/ollama"
import { OpenAiIcon } from "@/components/icons/open-ai"
import { PerplexityIcon } from "@/components/icons/perplexity"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "lucide-react"
import { Ref } from "react"

const LlmModelsStatus = (props: {
    llmModelsRef: Ref<HTMLDivElement> | null,
    className: string
}) => {
    return (
        <span className={props.className}>
            <AnimatedGroupContainer
                ref={props.llmModelsRef} 
                className={'bg-white rounded-lg h-[130px] w-[130px] place-items-center grid grid-rows-2 grid-cols-2 gap-2 p-2'}
            >
                <CircleIcon>
                    <OpenAiIcon/>
                </CircleIcon>
                <CircleIcon>
                    <OllamaIcon/>
                </CircleIcon>
                <CircleIcon>
                    <PerplexityIcon/>
                </CircleIcon>
                <CircleIcon>
                    <MixtralIcon/>
                </CircleIcon>
            </AnimatedGroupContainer>
        </span>
    )
}

export default LlmModelsStatus