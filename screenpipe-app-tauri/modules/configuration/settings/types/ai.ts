import { z } from 'zod';

export const AvailableAiProviders = {
    nativeOllama: "native-ollama",
    openai: "openai",
    custom: "custom",
    embedded: "embedded",
    screenpipeCloud: "screenpipe-cloud"
} as const

export type AvailableAiProvidersEnum = (typeof AvailableAiProviders)[keyof typeof AvailableAiProviders]

export const EmbeddedLLMConfigSchema = z.object({
    enabled: z.boolean(),
    model: z.string(),
    port: z.number()
})

export type EmbeddedLLMConfigType = z.infer<typeof EmbeddedLLMConfigSchema>;