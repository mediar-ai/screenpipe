import * as z from 'zod';

export const FieldTypeWithOptions = {
    SELECT: "SELECT",
} as const

export const RegularField = {
    SECRET_STRING: "SECRET_STRING",
    TEXTAREA: "TEXTAREA",
    SLIDER: "SLIDER",
    STRING: "STRING"
} as const

export const FormFieldTypes = {
    ...FieldTypeWithOptions,
    ...RegularField
} as const
export type FormFieldTypes = (typeof FormFieldTypes)[keyof typeof FormFieldTypes];

const optionsFieldSchema = z.object({
    isRegular: z.literal(false),
    type: z.nativeEnum(FieldTypeWithOptions),
    options: z.array(z.string()).optional(),
    entity: z.string().optional(),
})
export type OptionsField = z.infer<typeof optionsFieldSchema>;

const regularFieldSchema = z.object({
    isRegular: z.literal(true),
    type: z.nativeEnum(RegularField),
    options: z.undefined()
})
export type RegularField = z.infer<typeof regularFieldSchema>;

export const typeMetadata = z.discriminatedUnion('isRegular', [
    optionsFieldSchema,
    regularFieldSchema
])
