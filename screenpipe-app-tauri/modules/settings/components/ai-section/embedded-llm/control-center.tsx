import { Label } from "@/components/ui/label";
import { TooltipDefault } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { Settings, useSettings } from "@/lib/hooks/use-settings";
import { AiProviders } from "@/modules/ai-providers/providers";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { getSetupFormAndPersistedValues } from "@/modules/ai-providers/utils/get-setup-form-and-persisted-values";
import Form from "@/modules/form/components/form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LLMStatus } from "./llm-status";
import { LLMLogFiles } from "./log-files";
import { LLMControler } from "./llm-controller";
import { EmbeddedLLMState } from "@/modules/ai-providers/providers/embedded/provider-metadata";
import { DynamicBanner } from "./dynamic-banner";

export function EmbeddedControlCenter({
    aiProvider,
    setAiProvider
} : {
    aiProvider: AvailableAiProviders,
    setAiProvider: React.Dispatch<React.SetStateAction<AvailableAiProviders>>
}) {
    const { toast } = useToast();
    const { settings, updateSettings } = useSettings()
    const [ hasBeenSubmitted, setHasBeenSubmitted ] = useState(false)
    const [ embeddedLLMStatus, setEmbeddedLLMStatus ] = useState<EmbeddedLLMState>(EmbeddedLLMState.IDLE)

    const { data } = useQuery({
        queryKey: ['setupForm', aiProvider],
        queryFn: async () => {
            const result = await getSetupFormAndPersistedValues({
              activeAiProvider: settings.aiProviderType,
              selectedAiProvider: aiProvider,
              settings
            })
            return result
        }
    })

    const { 
        mutateAsync: updateSettingsAsync, 
        isPending: updateSettingsAsyncPending
    } = useMutation({
        mutationFn: async (values: Partial<Settings>) => {
          updateSettings({
            ...values
          });
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
    
    const { 
        mutateAsync: credentialValidation, 
        isPending:  credentialValidationPending
    } = useMutation({
        mutationFn: async (values: Partial<Settings>) => {
          if (AiProviders[aiProvider].credentialValidation) {
            await AiProviders[aiProvider].credentialValidation(values)
          }
        },
        onSuccess: () => {
          toast({
            title: "credential validation successful",
          });
        }, 
        onError: (e) => {
          toast({
            title: "credential validation failed!",
            description: e.message ? e.message : 'please try again.',
            variant: 'destructive'
          });
        }
    })
    
    async function submitChanges(values: {port: string, model: string}) {
      setHasBeenSubmitted(true)
      await updateSettingsAsync({
        embeddedLLM: {
          port: parseInt(values.port, 10),
          model: values.model,
          enabled: true
        }
      })
    }

    return (
      <div className="flex flex-col space-y-3">
        <DynamicBanner embeddedLLMStatus={embeddedLLMStatus}/>
        <div className="border rounded-md p-3">
          {data?.setupForm &&
              <Form
                controlledShowSubmitButton={!hasBeenSubmitted}
                defaultValues={data.defaultValues}
                isLoading={updateSettingsAsyncPending || credentialValidationPending}
                onSubmit={submitChanges}
                onReset={async () => setAiProvider(settings.aiProviderType)}
                key={aiProvider}
                form={data.setupForm}
              />
          }
        </div>

        <TooltipDefault
          hideTooltip={hasBeenSubmitted}
          text={'please submit configuration data to enable these controls.'}
        >
          <div 
            data-disabled={!hasBeenSubmitted}
            className="flex flex-col space-y-4 data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-pointer pt-2"
          >
            <div className="flex flex-col justify-between w-full space-y-1">
                <Label>
                  control center
                </Label>
                <p className="text-sm text-muted-foreground">
                    control and find useful information about screenpipe's embedded ai
                </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <LLMStatus
                  embeddedLLMState={embeddedLLMStatus}
                />
                <LLMControler
                  embeddedLLMStatus={embeddedLLMStatus}
                  setEmbeddedLLMStatus={setEmbeddedLLMStatus}
                />
            </div>
            <LLMLogFiles/>
          </div>
        </TooltipDefault>
      </div>
    )
}