import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

const fields: FieldSchema[] = [
  {
    key: 'model',
    title: 'llm model',
    placeholder: 'type model name',
    validationMeta: {
     optional: false,
    },
    typeMeta: {
      isRegular: false,
      type: 'SELECT_CREATEABLE', 
      options: []
    },
  },
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
  fields,
  buttonText: 'submit changes',
}