import { LlamaSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings, store } from "@/lib/hooks/use-settings";

export const NativeLlamaProvider: ProviderMetadata = {
    type: AvailableAiProviders.NATIVE_OLLAMA,
    title: 'ollama',
    description: 'run ai models locally using your existing ollama installation',
    imgSrc: '/images/ollama.png',
    setupForm: LlamaSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    } 
}