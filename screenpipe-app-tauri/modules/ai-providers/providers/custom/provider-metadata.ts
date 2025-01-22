import { CustomSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings, store } from "@/lib/hooks/use-settings";

export const CustomAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.CUSTOM,
    title: 'custom',
    description: 'connect to your own ai provider or self-hosted models',
    imgSrc: '/images/custom.png',
    setupForm: CustomSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            aiUrl: settings.aiUrl,
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    } 
}