import { Label } from "@/components/ui/label";
import { EmbeddedLLMState } from "@/modules/ai-providers/providers/embedded/provider-metadata";

const statuePerLLMState = {
    [EmbeddedLLMState.RUNNING]: "llama.32 is currently running",
    [EmbeddedLLMState.IDLE]: "embedded ai is not running",
    [EmbeddedLLMState.ERROR]: "looks like there is an issue!"
}

export function LLMStatus({
    embeddedLLMState
} : {
    embeddedLLMState: EmbeddedLLMState
}) {
    return (
        <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
            <div>
                <Label>
                    status
                </Label>
                <p className="text-[0.8rem] text-muted-foreground">
                    {statuePerLLMState[embeddedLLMState]}
                </p>
            </div>

            <div className=" w-[40px] h-[40px] border rounded-md flex justify-center items-center cursor-pointer">
                <div 
                    data-llmState={embeddedLLMState}
                    className="w-[15px] h-[15px] data-[llmState=IDLE]:bg-gray-300 data-[llmState=ERROR]:bg-red-500 data-[llmState=RUNNING]:bg-green-500 rounded-full"
                />
            </div>
        </div>
    )
}