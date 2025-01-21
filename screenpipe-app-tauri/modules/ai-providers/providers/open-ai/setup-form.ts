import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

const fields: FieldSchema[] = [
  {
    key: 'openaiApiKey',
    title: 'API Key',
    validationMeta: {
      errorMessage: 'this field is mandatory',
      min: 1,
      max: 50,
      optional: false
    },
    typeMeta: {
      isRegular: true,
      type: 'SECRET_STRING'
    }
  },
  {
    key: 'aiModel',
    title: 'ai model',
    placeholder: 'select or type model name',
    validationMeta: {
     optional: false,
     errorMessage: 'hey' 
    },
    typeMeta: {
      isRegular: false,
      type: 'SELECT', 
      options: [
        "gpt-4o",
        "gpt-4o-mini",
        "o1-mini",
        "o1"
      ]
    }
  },
  {
    key: 'customPrompt',
    title: 'prompt',
    placeholder: 'enter your custom prompt here',
    validationMeta: {
      optional: false,
      errorMessage: 'you need to provide a custom prompt'
    },
    typeMeta: {
      isRegular: true,
      type: 'TEXTAREA'
    }
  },
  {
    key: 'aiMaxContextChars',
    title: 'max content',
    validationMeta: {
      optional: false,
      errorMessage: 'you need to provide a custom prompt'
    },
    typeMeta: {
      isRegular: true,
      type: 'SLIDER'
    }
  }
]

export const OpenAiSetupForm: FormSchema = {
  title: 'configuration',
  fields,
  buttonText: 'submit changes',
}