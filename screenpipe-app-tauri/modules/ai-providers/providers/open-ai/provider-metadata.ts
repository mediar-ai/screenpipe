import { OpenAiSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";

export const OpenAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.OPENAI,
    title: 'open ai',
    description: 'use your own openai api key for gpt-4 and other models',
    imgSrc: '/images/openai.png',
    setupForm: OpenAiSetupForm
}