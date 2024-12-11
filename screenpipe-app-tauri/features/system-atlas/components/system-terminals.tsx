import { CircleIcon } from "@/components/ui/circle-icon"
import { LayoutGrid, Search } from "lucide-react"
import { Ref } from "react"

const SystemTerminals = (props: {
    appStoreRef: Ref<HTMLDivElement> | null,
    searchRef: Ref<HTMLDivElement> | null,
}) => {
    return (
        <>
        <CircleIcon ref={props.appStoreRef}>
            <LayoutGrid className="h-4 2-4"/>
        </CircleIcon>
        <div className="size-16"/>
        <CircleIcon ref={props.searchRef}>
            <Search className="h-4 w-4"/>
        </CircleIcon>
        </>
    )
}

export default SystemTerminals