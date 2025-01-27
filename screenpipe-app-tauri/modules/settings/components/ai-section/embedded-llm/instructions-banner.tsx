import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/ui/spinner";
import { toast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { useMutation } from "@tanstack/react-query";
import { Info, TriangleAlert } from "lucide-react";
import { useLLM } from "./context";
import { ModelState, SidecarState } from "@/modules/ai-providers/providers/embedded/provider-metadata";
import { useMemo } from "react";

type InfoBannerData = {
    title: string,
    description: string,
    icon: React.FC
}

type SidecarInfo = Record<SidecarState, InfoBannerData>
const sidecarInfo: SidecarInfo = {
    [SidecarState.UNKNOWN]: {
        title: 'we\'re checking screenpipe\'s sidecar status.',
        description: 'this may take a few seconds.',
        icon: TriangleAlert
    },
    [SidecarState.INACTIVE]: {
        title: 'screenpipe\'s sidecar is not running',
        description: 'to make screenpipe\'s embedded ai your ai provider, you need to start it first',
        icon: Info
    },
    [SidecarState.ACTIVE]: {
        title: 'sidecar is running',
        description: 'please make sure your ollama server is not running',
        icon: Info
    },
    [SidecarState.ERROR]: {
        title: 'sidecar is running',
        description: 'please make sure your ollama server is not running',
        icon: Info
    },
    // [EmbeddedLLMState.RUNNING]: {
    //     icon: Info,
    //     title: 'screenpipe embedded ai is running',
    //     description: 'would you like to make screenpipe embedded ai your default ai provider?',
    //     button: () => {
    //         const { sidecarStatus } = useLLM()
    //         const { updateSettings, settings } = useSettings()

    //         const { 
    //             mutateAsync: handleAiProviderUpdate, 
    //             isPending
    //         } = useMutation({
    //             mutationFn: async () => {
    //                 if (sidecarStatus !== EmbeddedLLMState.RUNNING) return
    //                 updateSettings({
    //                     aiProviderType: AvailableAiProviders.EMBEDDED,
    //                     aiUrl: `http://localhost:${settings.embeddedLLM.port}/v1`,
    //                     aiModel: settings.embeddedLLM.model
    //                 })
    //             },
    //             onSuccess: () => {
    //               toast({
    //                 title: "ai provider info updated",
    //               });
    //             }, 
    //             onError: (e) => {
    //               toast({
    //                 title: "ai provider update failed!",
    //                 description: e.message ? e.message : 'please try again.',
    //                 variant: 'destructive'
    //               });
    //             }
    //         })
    //         return (
    //             <div>
    //                 <Button 
    //                     className="min-w-[100px]" 
    //                     onClick={async () => await handleAiProviderUpdate()}
    //                 >
    //                     {isPending ? <Spinner/> : 'yes'}
    //                 </Button>
    //             </div>
    //         )
    //     }
    // }
}

type ModelInfo = Record<ModelState, InfoBannerData> 
const modelInfo: ModelInfo = {
    [ModelState.UNKNOWN]: {
        title: 'we\'re checking model status.',
        description: 'this may take a few seconds.',
        icon: TriangleAlert
    },
    [ModelState.INACTIVE]: {
        title: 'screenpipe\'s sidecar is not running a model',
        description: 'to make screenpipe\'s embedded ai your ai provider, you need to start it first',
        icon: Info
    },
    [ModelState.RUNNING]: {
        title: 'model is running',
        description: 'would you like to make embedded ai your default provider?',
        icon: Info
    },
    [ModelState.ERROR]: {
        title: 'model is running',
        description: 'would you like to make embedded ai your default provider?',
        icon: Info
    },
}

export function InstructionsBanner() {
    const { sidecarStatus, modelStatus, isPending } = useLLM()

    const { Icon, title, description } = useMemo(() => {
        if (sidecarStatus !== SidecarState.ACTIVE) {
            return {
                Icon: sidecarInfo[sidecarStatus].icon,
                title: sidecarInfo[sidecarStatus].title,
                description: sidecarInfo[sidecarStatus].description
            }
        }

        return {
            Icon: modelInfo[modelStatus].icon,
            title: modelInfo[modelStatus].title,
            description: modelInfo[modelStatus].description
        }
    }, [sidecarStatus, modelStatus])

    return (
        <div className="w-full bg-blue-100 h-[80px] rounded-[10px] flex justify-between items-center p-4">
            <div className="flex items-center justify-center space-x-3">
                {isPending 
                ? (
                    <div
                        className="w-[40px] h-[40px] p-[8px]"
                    >
                        <Spinner/>
                    </div>
                ) : <Icon/>
                }
                <div>
                    <Label>
                        {title}
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>
            {/* {
                infoPerState[sidecarStatus].button && 
                infoPerState[sidecarStatus].button()
            } */}
        </div>
    )
}