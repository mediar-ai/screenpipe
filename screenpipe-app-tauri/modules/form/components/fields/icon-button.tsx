import { Button } from "@/components/ui/button"
import { ReactComponentElement, ReactElement, ReactNode, useState } from "react"

export function IconButton({
    OnComponent, 
    OffComponent,
    defaultToggleValue,
    onClick
} : {
    OnComponent: React.FC<any>,
    OffComponent: React.FC<any>,
    defaultToggleValue: boolean | undefined,
    onClick(): void
}) {
    const [toggle, setToggle] = useState(!!defaultToggleValue)

    function handleClick() {
        setToggle(!toggle)
        onClick()
    }
    
    return (
        <Button
            type="button"
            onClick={() => handleClick()}
            size={"icon"}
            variant={'ghost'}
            className="border min-w-[40px] min-h-[40px]"
        >
            { toggle
                ? <OnComponent className="h-5 w-5" strokeWidth={1.5}/>
                : <OffComponent className="h-5 w-5" strokeWidth={1.5}/>
            }
        </Button>
    )
}