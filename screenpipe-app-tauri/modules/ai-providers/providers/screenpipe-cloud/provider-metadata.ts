import { ScreenpipeCloudSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";

export const ScreenpipeCloudProvider: ProviderMetadata = {
    type: AvailableAiProviders.SCREENPIPE_CLOUD,
    title: 'screenpipe cloud',
    description: 'use openai, anthropic and google models without worrying about api keys or usage',
    imgSrc: '/images/screenpipe.png',
    setupForm: ScreenpipeCloudSetupForm
}