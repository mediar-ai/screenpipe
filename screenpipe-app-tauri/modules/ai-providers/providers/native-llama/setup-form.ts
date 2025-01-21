import { FieldSchema } from "@/modules/form/entities/field/field-metadata"

const fields: FieldSchema[] = [
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

export const LlamaSetupForm = {
  title: 'llama provider setup',
  fields,
  buttonText: 'submit changes',
}