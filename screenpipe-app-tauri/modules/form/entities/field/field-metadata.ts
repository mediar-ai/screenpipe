import * as z from 'zod';
import { typeMetadata } from './type-metadata';
import { validationMeta } from './validation-metadata';

export const fieldSchema = z.object({
    key: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    validationMeta: validationMeta,
    typeMeta: typeMetadata
})

export type FieldSchema = z.infer<typeof fieldSchema>;