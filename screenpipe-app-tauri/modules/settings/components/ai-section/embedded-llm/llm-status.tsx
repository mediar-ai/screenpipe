import { ModelState, SidecarState } from "@/modules/ai-providers/providers/embedded/provider-metadata";

export function LLMStatus({ status }:{status: ModelState | SidecarState}) {
    return (
        <div className="w-[10%] border rounded-md flex justify-center items-center cursor-pointer">
            <div 
                data-llmState={status}
                className="w-[15px] h-[15px] bg-gray-300 data-[llmState=ERROR]:bg-red-500 data-[llmState=RUNNING]:bg-green-500 data-[llmState=ACTIVE]:bg-green-500 rounded-full"
            />
        </div>
    )
}