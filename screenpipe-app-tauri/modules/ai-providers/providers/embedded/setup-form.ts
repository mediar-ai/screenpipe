import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

const fields: FieldSchema[] = [
  {
    key: 'port',
    title: 'llm port',
    validationMeta: {
        optional: false,
    },
    typeMeta: {
        isRegular: true,
        type: 'STRING', 
    },
  }
]

export const EmbeddedSetupForm: FormSchema = {
  title: 'configuration',
  hideTitle: true,
  description: 'the following data will be used to run screenpipe\'s embedded ai',
  fields,
  buttonText: 'submit',
}