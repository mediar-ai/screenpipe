import { ActorRef } from "xstate"
import { useSelector } from "@xstate/react"
import { Ref, useEffect } from "react"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"
import WhisperIcon from "@/components/icons/whisper-huggingface"
import OnnxGithubIcon from "@/components/icons/onnx-github"
import { HoverCardInfo } from "@/components/ui/hover-card"
import { useWindowEventLister } from "@/modules/event-management/listener/adapters/react/window.hook"

const LocalModels = (props: {
    llmModelsRef: Ref<HTMLDivElement> | null,
    className: string,
    actorRef: ActorRef<any,any,any>,
    isContainerActive?: boolean
}) => { 
    const deviceStates = useSelector(props.actorRef, (snapshot) => {
        return snapshot.context.localModels
    })

    console.log({deviceStates})

    return (
        <span className={props.className}>
            <AnimatedGroupContainer
                color="#cece66"
                shouldScale={props.isContainerActive}
                ref={props.llmModelsRef} 
                className={'bg-white rounded-lg h-[65px] w-[130px] flex flex-row justify-around'}
            >

                <HoverCardInfo
                    title="openai's whisper model (stt)"
                    description="robust speech recognition via large-scale weak supervision."
                    footer="will be downloaded from hugging face."
                >
                    <CircleIcon
                        state={deviceStates.whisper}
                    >
                        <WhisperIcon/>
                    </CircleIcon>
                </HoverCardInfo>
                <HoverCardInfo
                    title="snakers4's silero in (vad)"
                    description="voice activity detection tool using next-gen kaldi with onnxruntime without internet connection."
                    footer="will be downloaded from github."
                >
                    <CircleIcon
                        state={deviceStates.silero}
                    >
                        <OnnxGithubIcon/>
                    </CircleIcon>
                </HoverCardInfo>
            </AnimatedGroupContainer>
        </span>
    )
}

export default LocalModels