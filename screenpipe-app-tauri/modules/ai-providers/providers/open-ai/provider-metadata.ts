import { OpenAiSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings } from "@/lib/hooks/use-settings";

export const OpenAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.OPENAI,
    title: 'openai',
    description: 'use your own openai api key for gpt-4 and other models',
    imgSrc: '/images/openai.png',
    setupForm: OpenAiSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            openApiKey: settings.openaiApiKey,
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    } 
}