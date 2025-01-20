import * as z from 'zod';

export const validationMeta = z.object({
    errorMessage: z.string().optional(),
    optional: z.boolean(),
    min: z.number().optional(),
    max: z.number().optional(),
    disabled: z.boolean().optional(),
})