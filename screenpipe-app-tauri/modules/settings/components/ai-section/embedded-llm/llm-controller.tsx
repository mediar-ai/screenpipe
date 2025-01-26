import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Dispatch, SetStateAction, useMemo } from "react";
import posthog from "posthog-js";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { useMutation } from "@tanstack/react-query";
import { useSettings } from "@/lib/hooks/use-settings";
import { EmbeddedLLMState } from "@/modules/ai-providers/providers/embedded/provider-metadata";
import Spinner from "@/components/ui/spinner";

export function LLMControler({
    embeddedLLMStatus,
    setEmbeddedLLMStatus
}: {
    embeddedLLMStatus: EmbeddedLLMState,
    setEmbeddedLLMStatus: Dispatch<SetStateAction<EmbeddedLLMState>>
}) {
    const { settings } = useSettings()

    const { 
      mutateAsync: startOllamaSidecar,
      isPending: startIsPending
  } = useMutation({
      mutationFn: async () => {
        posthog.capture("start_ollama_sidecar");
        toast({
          title: "starting ai",
          description:
            "downloading and initializing the embedded ai, may take a while (check $HOME/.ollama/models)...",
        });

        try {
          // const result = await invoke<string>("start_ollama_sidecar", {
          //   settings: {
          //     enabled: settings.embeddedLLM.enabled,
          //     model: settings.embeddedLLM.model,
          //     port: settings.embeddedLLM.port,
          //   },
          // });
  
          // return result

          return await new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve('success!!');
            }, 2000);
          });

        } catch (e) {
          console.log("AAAAH", {e})
        }
      },
      onSuccess: (result) => {
        setEmbeddedLLMStatus(EmbeddedLLMState.RUNNING);
        toast({
          title: "ai ready",
          description: `${settings.embeddedLLM.model} is running.`,
        });
        toast({
          title: `${settings.embeddedLLM.model} wants to tell you a joke.`,
          description: result,
          duration: 10000,
        });
      }, 
      onError: (e) => {
          console.error("Error starting ai sidecar:", e);
          setEmbeddedLLMStatus(EmbeddedLLMState.ERROR);
          toast({
            title: "error starting ai",
            description: "check the console for more details",
            variant: "destructive",
          });
      },
  })

    const { 
        mutateAsync: handleStopLLM,
        isPending: stopIsPending
    } = useMutation({
        mutationFn: async () => {
            await invoke("stop_ollama_sidecar");
        },
        onSuccess: () => {
            setEmbeddedLLMStatus(EmbeddedLLMState.IDLE);
            toast({
                title: "ai stopped",
                description: "the embedded ai has been shut down",
            });
        }, 
        onError: (e) => {
            // setEmbeddedLLMStatus(EmbeddedLLMState.IDLE);
            console.error("error stopping ai:", e);
            toast({
                title: "error stopping ai",
                description: "check the console for more details",
                variant: "destructive",
            });
        }
    })

    async function handleClick() {
      if (embeddedLLMStatus === EmbeddedLLMState.IDLE) {
        await startOllamaSidecar()
      } else if (embeddedLLMStatus === EmbeddedLLMState.RUNNING) {
        await handleStopLLM()
      }
    }

    const Component = useMemo(() => {
      if (embeddedLLMStatus === EmbeddedLLMState.ERROR) {
        return RotateCcw
      } else if (embeddedLLMStatus === EmbeddedLLMState.RUNNING) {
        return Pause
      } else {
        return Play
      }
    },[embeddedLLMStatus])

    return (
        <div className="w-full border h-[80px] rounded-[10px] flex p-4 items-center justify-between">
            <div>
                <Label>
                 start ai
                </Label>
            </div>

            <Button
                onClick={() => handleClick()}
                size={'icon'}
                className="w-[40px] h-[40px]"
            >
                {stopIsPending || startIsPending 
                  ? <div className="w-[60%] h-[80%]">
                      <Spinner/>
                    </div>
                  : <Component className="h-5 w-5"/>
                }
            </Button>
        </div>
    )
}