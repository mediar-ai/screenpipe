import * as z from 'zod';

export const FieldTypeWithOptions = {
    SELECT: "SELECT",
    SELECT_CREATEABLE: "SELECT_CREATEABLE"
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

const fieldBase = z.object({
    disabled: z.boolean().optional(),
    disabledToggle: z.boolean().optional()
})

const optionsFieldSchema = z.object({
    isRegular: z.literal(false),
    type: z.nativeEnum(FieldTypeWithOptions),
    options: z.array(z.string()).optional(),
}).merge(fieldBase)
export type OptionsField = z.infer<typeof optionsFieldSchema>;

const regularFieldSchema = z.object({
    isRegular: z.literal(true),
    type: z.nativeEnum(RegularField),
    options: z.undefined()
}).merge(fieldBase)
export type RegularField = z.infer<typeof regularFieldSchema>;

export const typeMetadata = z.discriminatedUnion('isRegular', [
    optionsFieldSchema,
    regularFieldSchema
])
