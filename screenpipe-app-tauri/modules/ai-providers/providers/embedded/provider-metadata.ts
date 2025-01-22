import { Settings } from "@/lib/hooks/use-settings";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { EmbeddedSetupForm } from "./setup-form";

export const EmbeddedAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.EMBEDDED,
    title: 'embedded ai',
    description: 'use the built-in ai engine for offline processing',
    imgSrc: '/images/embedded.png',
    setupForm: EmbeddedSetupForm,
    defaultValuesGetter: () => {
        return {
            model: "llama3.2:1b-instruct-q4_K_M",
            port: 11434,
        }
    },
    savedValuesGetter: (settings: Settings) => {
        return {
            model: settings.embeddedLLM.model,
            port: settings.embeddedLLM.port
        }
    },
}
// essentially then embedded ischosen
// show form, save settings
// once settings are saved, enable llm model control component
// this component should start, stop and show status and logs