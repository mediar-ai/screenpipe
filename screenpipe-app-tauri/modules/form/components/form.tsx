"use client"
import { useRef } from "react";
import { z } from 'zod';
import { FormRenderer, FormRendererHandles } from "./shell";
import { generateFormSchema } from "../utils/zod-schema-generator";

export default function Form({
  onCreate, 
  isLoading,
  form,
  defaultValues,
} : {
  onCreate?: (values: any) => Promise<void>;
  isLoading?: boolean;
  defaultValues?:any,
  form: any,
}) {
  const refForm = useRef<FormRendererHandles<FormSchema>>(null);
  
  async function handleSubmit(values: FormSchema) {
    if (refForm.current) {
      if (!onCreate) {
        console.log({values})
      } else {
        await onCreate(values);
      }
      refForm.current.reset(refForm.current.getValues());
    }
  }

  const formSchema = generateFormSchema(form.fields)
  type FormSchema = z.infer<typeof formSchema>
  
  return (
    <FormRenderer
      buttonText={form.button}
      title={form.title}
      defaultValues={defaultValues}
      description={form.description}
      fields={form.fields}
      formZodSchema={formSchema}
      onSubmit={handleSubmit}
      isLoading={isLoading}
      showInternalButton
      ref={refForm}
    />
  )
}