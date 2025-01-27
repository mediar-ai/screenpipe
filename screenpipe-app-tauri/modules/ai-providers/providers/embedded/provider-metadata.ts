import { Settings } from "@/lib/hooks/use-settings";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { EmbeddedSetupForm } from "./setup-form";

export const SidecarState = {
    UNKNOWN: "UNKNOWN",
    INACTIVE: "INACTIVE",
    ACTIVE: "ACTIVE",
    ERROR: "ERROR",
} as const

export type SidecarState = keyof typeof SidecarState

export const ModelState = {
    UNKNOWN: "UNKNOWN",
    INACTIVE: "INACTIVE",
    RUNNING: "RUNNING",
    ERROR: "ERROR"
} as const

export type ModelState = keyof typeof ModelState


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