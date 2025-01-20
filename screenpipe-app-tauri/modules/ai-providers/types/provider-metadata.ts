import { z } from "zod";
import { AvailableAiProviders } from "./available-providers";

export const ProviderMetadata = z.object({
    type: z.nativeEnum(AvailableAiProviders),
    title: z.string(),
    description: z.string(),
    imgSrc: z.string(),
    setupForm: z.any()
})

export type ProviderMetadata = z.infer<typeof ProviderMetadata>