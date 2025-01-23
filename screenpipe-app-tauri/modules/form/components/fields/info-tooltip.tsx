import { TooltipDefault } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

export function InfoTooltip({
    text
} : {
    text: string
}) {
    return (
        <TooltipDefault 
            text={text}
            side="right"
        >
            <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
        </TooltipDefault>
    )
}