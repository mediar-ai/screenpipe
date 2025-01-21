import { FieldSchema } from "@/modules/form/entities/field/field-metadata"

const fields: FieldSchema[] = [
  {
    key: 'apiKey',
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
        {
          value: "gpt-4o",
          label: "gpt-4o"
        },
        {
          value: "gpt-4o-mini",
          label: "gpt-4o-mini"
        },
        {
          value: "o1-mini",
          label: "o1-mini",
        },
        {
          value: "o1",
          label: "o1"
        },
      ]
    }
  },
  {
    key: 'prompt',
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
    key: 'maxContent',
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

export const OpenAiSetupForm = {
  title: 'openai provider setup',
  fields,
  buttonText: 'submit changes',
}