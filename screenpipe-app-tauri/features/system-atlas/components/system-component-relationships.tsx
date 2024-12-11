import { AnimatedBeam } from "@/components/ui/animated-beam"
import { Ref } from "react"

const SystemComponentRelationships = (props: {
    containerRef: Ref<HTMLDivElement> | null,
    micRef: Ref<HTMLDivElement> | null,
    keyboardRef: Ref<HTMLDivElement> | null,
    monitorRef: Ref<HTMLDivElement> | null,
    screenpipeRef: Ref<HTMLDivElement> | null,
    appStoreRef: Ref<HTMLDivElement> | null,
    searchRef: Ref<HTMLDivElement> | null,
    userRef: Ref<HTMLDivElement> | null,
    collectionRef: Ref<HTMLDivElement> | null,
    llmModelsRef: Ref<HTMLDivElement> | null,
}) =>{
    return (
        <>
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.micRef}
            toRef={props.screenpipeRef}
            curvature={-100}
            endYOffset={-20}
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.keyboardRef}
            toRef={props.screenpipeRef}
            curvature={0}
            endYOffset={0}
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.monitorRef}
            toRef={props.screenpipeRef}
            curvature={100}
            endYOffset={20}
        />
        
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.appStoreRef}
            toRef={props.screenpipeRef}
            curvature={-100}
            endYOffset={-20}
            reverse
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.searchRef}
            toRef={props.screenpipeRef}
            curvature={100}
            endYOffset={20}
            reverse
        />

        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.appStoreRef}
            toRef={props.collectionRef}
            curvature={0}
            endYOffset={0}
            reverse
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.userRef}
            toRef={props.searchRef}
            curvature={0}
            endYOffset={0}
            reverse
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.screenpipeRef}
            toRef={props.llmModelsRef}
            curvature={0}
            endYOffset={0}
            reverse
        />
        <AnimatedBeam
            containerRef={props.containerRef}
            fromRef={props.collectionRef}
            toRef={props.userRef}
            curvature={0}
            endYOffset={0}
            reverse
        />
        </>
    )
}

export default SystemComponentRelationships