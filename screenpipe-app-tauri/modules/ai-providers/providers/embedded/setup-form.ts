import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

const fields: FieldSchema[] = [
  {
    key: 'model',
    title: 'llm model',
    description: 'any model listed in ollama can be used.',
    infoTooltip: ' supported models are the same as ollama. check the ollama documentation for a list of available models.',
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
  description: 'the following data will be used to run screenpipe\'s embedded ai',
  fields,
  buttonText: 'submit',
}