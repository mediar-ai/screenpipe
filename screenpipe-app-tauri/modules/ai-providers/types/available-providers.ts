export const AvailableAiProviders = {
    OPENAI: "OPENAI",
    SCREENPIPE_CLOUD: "SCREENPIPE_CLOUD",
    NATIVE_OLLAMA: "NATIVE_OLLAMA",
    CUSTOM: "CUSTOM",
    EMBEDDED: "EMBEDDED"
} as const
export type AvailableAiProviders = keyof typeof AvailableAiProviders;
