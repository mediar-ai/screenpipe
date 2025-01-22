import { LogFileButton } from "@/components/log-file-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";

const EmbeddedLlmState = {
    RUNNING: "RUNNING",
    ERROR: "ERROR",
    IDLE: "IDLE"
}

export function EmbeddedControlCenter() {
    return (
        <div className="flex flex-col">
        <div className="flex items-center gap-4 mb-4 w-full">
          <div className="flex items-center justify-between w-full">
            <div className="space-y-1">
              <Label>control center</Label>
              <p className="text-sm text-muted-foreground">
                control and find useful information about the embedded ai
              </p>
            </div>
            <div className="flex items-center gap-2">
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-3 mb-[20px]">
            <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
                <div>
                    <Label>
                        this is currently not your ai provider
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                        to activate embedded llm as your provider you need to start it first.
                    </p>
                </div>

                

            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
                <div>
                    <Label>
                    status
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                    llama.32 is currently running
                    </p>
                </div>

                <div className=" w-[40px] h-[40px] border rounded-md flex justify-center items-center cursor-pointer">
                    <div className="w-[15px] h-[15px] bg-blue-500 rounded-full"/>
                </div>
                {/* <Button
                    onClick={()=>console.log('ha')}
                    size={'icon'}
                    className="w-[40px] h-[40px]"
                >
                    <Play className="h-5 w-5"/>
                </Button> */}
                </div>
                <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
                <div>
                    <Label>
                    start ai
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                    omgomgom
                    </p>
                </div>

                <Button
                    onClick={()=>console.log('ha')}
                    size={'icon'}
                    className="w-[40px] h-[40px]"
                >
                    <Play className="h-5 w-5"/>
                </Button>
                </div>
            </div>
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
        </div>
      </div>
    )
}