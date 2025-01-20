import { z } from "zod"
import { FormFieldTypes } from "../entities/field/type-metadata"
import { FieldSchema } from "../entities/field/field-metadata"

export function generateFormSchema(
  fields: (FieldSchema)[]
) {

  const schemaObject: Record<string, any> = {}

  if (fields && fields.length) {
    fields.forEach((field) => {
      let fieldSchema

      switch (field.typeMeta.type) {
        case FormFieldTypes.SELECT: 
          fieldSchema = z.object({
              key: z.number().or(z.string()),
              label: z.string(),
              value: z.string().optional(),
              color: z.string().optional()
            })
          break
        case FormFieldTypes.STRING:
          fieldSchema = z.string()

          if (field.validationMeta.min) {
            fieldSchema = fieldSchema.min(field.validationMeta.min, { message: `Please enter at least ${field.validationMeta.min} characters` })
          }
    
          if (field.validationMeta.max) {
            fieldSchema = fieldSchema.max(field.validationMeta.max, { message: `The field must not exceed ${field.validationMeta.max} characters` })
          }

          if(field.validationMeta.optional){
            fieldSchema.optional()
          }

          break;
        default: 
          fieldSchema = z.any().optional()
          break;
      }

      schemaObject[field.key] = fieldSchema
    })
  }

  return z.object(schemaObject)
}

export function toCamelCase(str: string) {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')   // Replace non-alphanumeric characters with spaces
    .trim()                          // Remove leading and trailing spaces
    .split(/\s+/)                    // Split by any whitespace
    .map((word, index) => 
      index === 0 
        ? word.toLowerCase()         // Lowercase the first word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() // Capitalize the first letter of other words
    )
    .join('');                       // Join the words back together
}

export function capitalizeFirstLetter(sighs: string) {
  return sighs.charAt(0).toUpperCase() + sighs.slice(1).toLocaleLowerCase();
}