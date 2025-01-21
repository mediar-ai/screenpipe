export const AvailableAiProviders = {
    OPENAI: "openai",
    SCREENPIPE_CLOUD: "screenpipe-cloud",
    NATIVE_OLLAMA: "native-ollama",
    CUSTOM: "custom",
    // EMBEDDED: "EMBEDDED"
} as const
export type AvailableAiProviders = typeof AvailableAiProviders[keyof typeof AvailableAiProviders];
