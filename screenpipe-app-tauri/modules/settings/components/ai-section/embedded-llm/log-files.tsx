import { LogFileButton } from "@/components/log-file-button";
import { Label } from "@/components/ui/label";

export function LLMLogFiles() {
    return (
        <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
            <div>
                <Label>
                    app log files
                </Label>
                <p className="text-[0.8rem] text-muted-foreground">
                    find logs that can help you understand what is happening with the embedded ai.
                </p>
            </div>

            <LogFileButton isAppLog={true} size="10"/>
        </div>
)
}