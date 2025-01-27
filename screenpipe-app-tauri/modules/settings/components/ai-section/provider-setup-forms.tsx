import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Settings, useSettings } from "@/lib/hooks/use-settings";
import { AiProviders } from "@/modules/ai-providers/providers";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { getSetupFormAndPersistedValues } from "@/modules/ai-providers/utils/get-setup-form-and-persisted-values";
import Form from "@/modules/form/components/form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell"
import { ExternalLinkIcon, TriangleAlert } from "lucide-react";
import { useUser } from "../account-section";
import { InputSkeleton } from "@/components/ui/input";
import { TextareaSkeleton } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { InstructionsBanner } from "./embedded-llm/instructions-banner";

export function RegularProviderSetupForm({
    aiProvider,
    setAiProvider
} : {
    aiProvider: AvailableAiProviders,
    setAiProvider: React.Dispatch<React.SetStateAction<AvailableAiProviders>>
}) {
    const { toast } = useToast();
    const { settings, updateSettings } = useSettings()

    const { data, isLoading } = useQuery({
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
          try {
            updateSettings({
              ...values
            });
          } catch (e: any) {
            throw new Error(e.message)
          }
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
          try {
            if (AiProviders[aiProvider].credentialValidation) {
              await AiProviders[aiProvider].credentialValidation(values)
            }
          } catch (e: any) {
            throw new Error(e.message)
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
    
    async function submitChanges(values: Partial<Settings>) {
        await credentialValidation(values)
        await updateSettingsAsync({
          ...values, 
          aiProviderType: aiProvider
        })
    }

    if (isLoading) {
      return (
        <>
          <InputSkeleton/>
          <InputSkeleton/>
          <TextareaSkeleton/>
          <div className="animate-pulse">
            <Slider disabled/>
          </div>
        </>
      )
    }

    if ((aiProvider === AvailableAiProviders.NATIVE_OLLAMA) && !data?.setupForm) {
      return (
        <InstructionsBanner
          title="looks like your ollama server is not running"
          icon={TriangleAlert}
          description="please initiate the server and try again"
          isPending={false}
        />
      )
    }

    if (aiProvider === AvailableAiProviders.SCREENPIPE_CLOUD && !settings.user.token) {
      <ScreenpipeLogin/>
    }

    return (
        <>
        {data?.setupForm &&
          <Form
            isDirty={!(aiProvider === settings.aiProviderType)}
            defaultValues={data.defaultValues}
            isLoading={updateSettingsAsyncPending || credentialValidationPending}
            onSubmit={submitChanges}
            onReset={async () => setAiProvider(settings.aiProviderType)}
            key={aiProvider}
            form={data.setupForm}
          />
        }
      </>
    )
}

function ScreenpipeLogin() {
  useUser()

  return (
      <div className="w-full flex flex-col items-center space-y-3">
        <h1>
            please login to your screenpipe account to continue
        </h1>
        <Button
            variant="outline"
            size="sm"
            onClick={() => openUrl("https://screenpi.pe/login")}
            className="hover:bg-secondary/80"
        >
            login <ExternalLinkIcon className="w-4 h-4 ml-2" />
        </Button>
      </div>
  )
}