import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Eraser } from "lucide-react"
import { FieldValues, UseFormReset, useFormState } from "react-hook-form"

export const FormStatus = <FormValues extends FieldValues>({
    isDirty: externalIsDirty,
    reset
} : {
    reset(): void,
    isDirty?: boolean
}) => {
    const { isDirty } = useFormState()

    if (!isDirty && !externalIsDirty) return null

    return (
        <div className="flex items-center space-x-2">
            <p className="opacity-50 font-[200] font-sans">
                unsaved edits!
            </p>
            
            <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button
                    variant={'ghost'} 
                    type='button'
                    size={'icon'}
                    onClick={() => reset()}
                >
                    <Eraser className="h-5 w-5" strokeWidth={1.5}/>
                </Button>
                </TooltipTrigger>
                <TooltipContent>
                <p>
                    reset to saved values
                </p>
                </TooltipContent>
            </Tooltip>
            </TooltipProvider>
        </div>
    )
}