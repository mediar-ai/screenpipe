"use client"
import type { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import { FieldSchema } from "../entities/field/field-metadata";
import { FormFieldTypes } from "../entities/field/type-metadata";
import FormSecretStringField from "./fields/secret-string";
import FormStringField from "./fields/string";
import FormSelect from "./fields/form-select";

export interface FormFieldRendererProps {
  placeholder?: string,
  element: FieldSchema;
  form: UseFormReturn<any>;
  isLoading?: boolean;
  isLast?: boolean;
  showInternalButton?: boolean;
  field: ControllerRenderProps<any, string>,
}

export const FormFieldRenderer = ({
  element,
  form,
  isLoading,
  isLast,
  showInternalButton,
  field,
}: FormFieldRendererProps) => {
  switch (element.typeMeta.type) {
    case FormFieldTypes.STRING: {
      return (
       <FormStringField
          field={field}
          placeholder={element.placeholder}
        />
      );
    }
    case FormFieldTypes.SECRET_STRING: {
      return (
        <FormSecretStringField
          field={field}
        />
      ) 
    }
    case FormFieldTypes.SELECT: {
      return (
        <FormSelect
          field={field}
          element={element}
          form={form}
        />
      )
    }
    default:
      return null;
  }
};
