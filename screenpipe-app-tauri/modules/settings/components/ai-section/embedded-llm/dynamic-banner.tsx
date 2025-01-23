import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/ui/spinner";
import { toast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { EmbeddedLLMState } from "@/modules/ai-providers/providers/embedded/provider-metadata";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { useMutation } from "@tanstack/react-query";
import { Info } from "lucide-react";

export function DynamicBanner({
    embeddedLLMStatus
}: {
    embeddedLLMStatus: EmbeddedLLMState
}) {
    const { settings, updateSettings } = useSettings()

    const { 
        mutateAsync: handleAiProviderUpdate, 
        isPending
    } = useMutation({
        mutationFn: async () => {
            if (embeddedLLMStatus !== EmbeddedLLMState.RUNNING) return
            updateSettings({
                aiProviderType: AvailableAiProviders.EMBEDDED,
                aiUrl: `http://localhost:${settings.embeddedLLM.port}/v1`,
                aiModel: settings.embeddedLLM.model
            })
        },
        onSuccess: () => {
          toast({
            title: "ai provider info updated",
          });
        }, 
        onError: (e) => {
          toast({
            title: "ai provider update failed!",
            description: e.message ? e.message : 'please try again.',
            variant: 'destructive'
          });
        }
    })

    if (embeddedLLMStatus !== EmbeddedLLMState.RUNNING) {
        return (
            <div className="w-full bg-blue-100 h-[80px] rounded-[10px] flex items-center space-x-3 p-4">
                <Button
                    size={'icon'}
                    variant={'ghost'}
                >
                    <Info/>
                </Button>
                <div>
                    <Label>
                        embedded ai is not running
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                        to make screenpipe's embedded ai your ai provider, you need to start it first
                    </p>
                </div>
            </div>
        )
    } 

    return (
        <div className="w-full bg-blue-100 h-[80px] rounded-[10px] flex justify-between items-center p-4">
            <div className="flex items-center justify-center space-x-3">
                <Info/>
                <div>
                    <Label>
                        screenpipe embedded ai is running
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                        would you like to make this you ai provider?
                    </p>
                </div>
            </div>
            <div>
                <Button 
                    className="min-w-[100px]" 
                    onClick={async () => await handleAiProviderUpdate()}
                >
                    {isPending ? <Spinner/> : 'yes'}
                </Button>
            </div>
        </div>
    )
}