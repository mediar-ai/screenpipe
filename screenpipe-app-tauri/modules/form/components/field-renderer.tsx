"use client"
import type { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import { FieldSchema } from "../entities/field/field-metadata";
import { FormFieldTypes } from "../entities/field/type-metadata";
import FormSecretStringField from "./fields/secret-string";
import Select from "@/components/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

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
        <Input
          {...field}
          placeholder={element.placeholder}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          type="text"
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
        <Select
          className="w-[100%]"
          options={element.typeMeta.options}
          {...field}
        />
      )
    }
    case FormFieldTypes.TEXTAREA: {
      return (
        <div className="relative w-full h-[200px]">
          <Textarea
              className="resize-none h-full"
              {...field}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              placeholder={element.placeholder}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2"
            onClick={()=>console.log('ha')}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            reset
          </Button>
        </div>
      )
    }
    case FormFieldTypes.SLIDER: {
      return (
        <Slider
          min={0}
          max={100}
          step={1}
          onValueChange={(vals) => {
            field.onChange(vals[0]);
          }}
        />
      )
    }
    default:
      return null;
  }
};
