import { LlamaSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";

export const NativeLlamaProvider: ProviderMetadata = {
    type: AvailableAiProviders.NATIVE_OLLAMA,
    title: 'ollama',
    description: 'run ai models locally using your existing ollama installation',
    imgSrc: '/images/ollama.png',
    setupForm: LlamaSetupForm
}