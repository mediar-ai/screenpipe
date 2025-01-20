import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";

export const EmbeddedAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.EMBEDDED,
    title: 'embedded ai',
    description: 'use the built-in ai engine for offline processing',
    imgSrc: '/images/embedded.png',
    setupForm: undefined
}