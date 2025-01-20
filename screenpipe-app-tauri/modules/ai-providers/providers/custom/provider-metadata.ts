import { CustomSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";

export const CustomAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.CUSTOM,
    title: 'custom',
    description: 'run ai models locally using your existing ollama installation',
    imgSrc: '/images/custom.png',
    setupForm: CustomSetupForm
}