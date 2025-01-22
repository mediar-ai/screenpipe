"use client"
import { useRef } from "react";
import { z } from 'zod';
import { FormRenderer, FormRendererHandles } from "./shell";
import { generateFormSchema } from "../utils/zod-schema-generator";
import { FormSchema } from '../entities/form';

export default function Form({
  isDirty,
  onSubmit,
  onReset,
  isLoading,
  form,
  defaultValues,
} : {
  isDirty?: boolean,
  onSubmit?: (values: any) => Promise<void>;
  onReset?: () => Promise<void>;
  isLoading?: boolean;
  defaultValues?:any,
  form: FormSchema,
}) {
  const refForm = useRef<FormRendererHandles<FormSchema>>(null);
  
  async function handleSubmit(values: FormSchema) {
    if (refForm.current) {
      if (!onSubmit) {
        console.log({values})
      } else {
        try {
          await onSubmit(values);
        } catch (e) {
          return
        }
      }
      refForm.current.reset(refForm.current.getValues());
    }
  }

  async function resetForm() {
    if (refForm.current) {
      refForm.current.reset();
      
      if (onReset) {
        await onReset()
      }
    }
  }

  const formSchema = generateFormSchema(form.fields)
  type FormSchema = z.infer<typeof formSchema>
  
  return (
    <FormRenderer
      isDirty={isDirty}
      resetForm={resetForm}
      buttonText={form.buttonText}
      title={form.title}
      fields={form.fields}
      description={form.description}
      hideTitle={form.hideTitle}
      defaultValues={defaultValues}
      formZodSchema={formSchema}
      onSubmit={handleSubmit}
      isLoading={isLoading}
      showInternalButton
      ref={refForm}
    />
  )
}