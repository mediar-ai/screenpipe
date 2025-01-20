import { AvailableAiProviders } from "../types/available-providers";
import { ProviderMetadata } from "../types/provider-metadata";
import { CustomAiProvider } from "./custom/provider-metadata";
import { EmbeddedAiProvider } from "./embedded/provider-metadata";
import { NativeLlamaProvider } from "./native-llama/provider-metadata";
import { OpenAiProvider } from "./open-ai/provider-metadata";
import { ScreenpipeCloudProvider } from "./screenpipe-cloud/provider-metadata";

export const AiProviders: Record<AvailableAiProviders, ProviderMetadata> = {
    [AvailableAiProviders.OPENAI]: OpenAiProvider,
    [AvailableAiProviders.SCREENPIPE_CLOUD]: ScreenpipeCloudProvider,
    [AvailableAiProviders.CUSTOM]: CustomAiProvider,
    [AvailableAiProviders.EMBEDDED]: EmbeddedAiProvider,
    [AvailableAiProviders.NATIVE_OLLAMA]: NativeLlamaProvider
}