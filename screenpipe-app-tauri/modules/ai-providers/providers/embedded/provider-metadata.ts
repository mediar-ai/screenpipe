import { Settings } from "@/lib/hooks/use-settings";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { EmbeddedSetupForm } from "./setup-form";


export const EmbeddedLLMState = {
    RUNNING: "RUNNING",
    ERROR: "ERROR",
    IDLE: "IDLE"
} as const

export type EmbeddedLLMState = keyof typeof EmbeddedLLMState

export const EmbeddedAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.EMBEDDED,
    title: 'embedded ai',
    description: 'use the built-in ai engine for offline processing',
    imgSrc: '/images/embedded.png',
    setupForm: EmbeddedSetupForm,
    defaultValuesGetter: (settings: Settings) => {
        return {
            model: !!settings.embeddedLLM.model ? settings.embeddedLLM.model : "llama3.2:1b-instruct-q4_K_M",
            port: settings.embeddedLLM.port ?  settings.embeddedLLM.port.toString() : "11434",
        }
    },
    savedValuesGetter: (settings: Settings) => {
        return {
            model: settings.embeddedLLM.model,
            port: settings.embeddedLLM.port.toString()
        }
    },
}
// essentially then embedded ischosen
// show form, save settings
// once settings are saved, enable llm model control component
// this component should start, stop and show status and logs