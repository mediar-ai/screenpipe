import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

const fields: FieldSchema[] = [
  {
    key: 'aiUrl',
    title: 'endpoint url',
    validationMeta: {
      errorMessage: 'this field is mandatory',
      min: 1,
      max: 50,
      optional: false
    },
    typeMeta: {
      isRegular: true,
      type: 'STRING',
      disabledToggle: true,
      disabled: true
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
        "o1",
        "claude-3-5-sonnet-latest",
        "claude-3-5-haiku-latest",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro"
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

export const ScreenpipeCloudSetupForm: FormSchema = {
  title: 'configuration',
  fields,
  buttonText: 'submit changes',
}