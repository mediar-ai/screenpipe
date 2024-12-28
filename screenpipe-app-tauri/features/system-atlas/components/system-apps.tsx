import { GoogleDocsIcon } from "@/components/icons/google-docs"
import { GoogleDriveIcon } from "@/components/icons/google-drive"
import { NotionIcon } from "@/components/icons/notion"
import { ZapierIcon } from "@/components/icons/zapier"
import { AnimatedGroupContainer } from "@/components/ui/animated-group-container"
import { CircleIcon } from "@/components/ui/circle-icon"
import { cn } from "@/lib/utils"
import { Ref } from "react"


const SystemApps = (props: {
    collectionRef: Ref<HTMLDivElement> | null,
    className: string,
    isContainerActive?: boolean
}) => {
    return (
        <AnimatedGroupContainer
            shouldScale={props.isContainerActive}
            ref={props.collectionRef} 
            className={cn(
                "bg-white  grid grid-cols-2 grid-rows-2 place-items-center rounded-lg gap-2 p-2 h-[130px] w-[130px]", 
                props.className)
            }
        >
            <CircleIcon>
                <GoogleDocsIcon/>
            </CircleIcon>
            <CircleIcon>
                <NotionIcon/>
            </CircleIcon>
            <CircleIcon>
                <GoogleDriveIcon/>
            </CircleIcon>
            <CircleIcon>
                <ZapierIcon/>
            </CircleIcon>
        </AnimatedGroupContainer>
    )
}

export default SystemApps