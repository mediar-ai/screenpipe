import { FieldSchema } from "@/modules/form/entities/field/field-metadata"
import { FormSchema } from "@/modules/form/entities/form"

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
        {
          value: "claude-3-5-sonnet-latest",
          label: "claude-3-5-sonnet-latest",
        },
        {
          value: "claude-3-5-haiku-latest",
          label: "claude-3-5-haiku-latest",
        },
        {
          value: "gemini-2.0-flash-exp",
          label: "gemini-2.0-flash-exp",
        },
        {
          value: "gemini-2.0-flash-exp",
          label: "gemini-2.0-flash-exp",
        },
        {
          value: "gemini-1.5-flash",
          label: "gemini-1.5-flash",
        },
        {
          value: "gemini-1.5-flash-8b",
          label: "gemini-1.5-flash-8b"
        },
        {
          value: "gemini-1.5-pro",
          label: "gemini-1.5-pro"
        }
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

export const ScreenpipeCloudSetupForm: FormSchema = {
  title: 'screenpipe cloud provider setup',
  hideTitle: true,
  fields,
  buttonText: 'submit changes',
}