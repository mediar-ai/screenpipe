import { LayoutGrid, Search } from "lucide-react"
import { Ref } from "react"
import { useSelector } from "@xstate/react"
import { ActorRef } from "xstate"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"

const SystemTerminals = (props: {
    isAppStoreActive: boolean,
    isSearchActive: boolean,
    appStoreRef: Ref<HTMLDivElement> | null,
    searchRef: Ref<HTMLDivElement> | null,
    actorRef: ActorRef<any,any,any>,
}) => {
    const appStoreState = useSelector(props.actorRef, (snapshot) => {
        return snapshot.context.appstore
    })
    return (
        <>
        <AnimatedGroupContainer
            hiddenBorder
            shouldScale={props.isAppStoreActive}
            className="data-[isactive=true]:p-2"
        >
            <CircleIcon
                state={appStoreState}
                ref={props.appStoreRef}
            >
                <LayoutGrid className="h-4 2-4"/>
            </CircleIcon>
        </AnimatedGroupContainer>
        <AnimatedGroupContainer
            hiddenBorder
            shouldScale={props.isSearchActive}
            className="data-[isactive=true]:p-2"
        >
            <CircleIcon ref={props.searchRef}>
                <Search className="h-4 w-4"/>
            </CircleIcon>
        </AnimatedGroupContainer>
        </>
    )
}

export default SystemTerminals