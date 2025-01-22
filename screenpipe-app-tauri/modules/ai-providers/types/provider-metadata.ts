import { z } from "zod";
import { AvailableAiProviders } from "./available-providers";
import { formSchema } from "@/modules/form/entities/form";

export const ProviderMetadata = z.object({
    type: z.nativeEnum(AvailableAiProviders),
    title: z.string(),
    description: z.string(),
    imgSrc: z.string(),
    setupForm: formSchema,
    // TODOO: TYPE SAFETY
    savedValuesGetter: z.function().args(z.any()).returns(z.any()),
    credentialValidation: z.function().args(z.any()).returns(z.any())
})

export type ProviderMetadata = z.infer<typeof ProviderMetadata>