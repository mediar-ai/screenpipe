import { OpenAiSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings } from "@/lib/hooks/use-settings";
import OpenAI from "openai";

export const OpenAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.OPENAI,
    title: 'openai',
    description: 'use your own openai api key for gpt-4 and other models',
    imgSrc: '/images/openai.png',
    setupForm: OpenAiSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            openaiApiKey: settings.openaiApiKey,
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    },
    credentialValidation: async (credentials: {openaiApiKey: string, model: string}) => {
        const openai = new OpenAI({
            apiKey: credentials.openaiApiKey,
            dangerouslyAllowBrowser: true
        });
          
        const completion = await openai.chat.completions.create({
            model: credentials.model,
            store: true,
            messages: [
                {"role": "user", "content": "write a haiku about ai"},
            ],
        });

        return completion
    }
}