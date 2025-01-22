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
import { EyeIcon, EyeOff, LockKeyhole, LockKeyholeOpen, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { IconButton } from "./fields/icon-button";

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
      const inputRef = useRef<HTMLInputElement>(null);
      const toggleDisabled = useCallback(() => {
        if (inputRef.current) {
          inputRef.current.disabled = !inputRef.current.disabled;
        }
      }, []);
      return (
        <div className="relative w-full flex flex-row space-x-2">
          <Input
            {...field}
            ref={inputRef}
            disabled={element.typeMeta.disabled}
            placeholder={element.placeholder}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            type="text"
          />
          { element.typeMeta.disabledToggle && (
            <IconButton
              onClick={toggleDisabled}
              defaultToggleValue={element.typeMeta.disabled}
              OnComponent={LockKeyhole}
              OffComponent={LockKeyholeOpen}
            />
          )}
        </div>
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
      const options = useMemo(() => {
        return element.typeMeta.options?.map((option) => {
          return {
            value: option, 
            label: option
          }
        })
      },[])

      
      return (
        <Select
          className="w-[100%]"
          options={options}
          {...field}
          onChange={(e) => field.onChange(e?.value)}
          value={field.value ? {value: field.value, label: field.value} : undefined}
          placeholder={element.placeholder}
        />
      )
    }
    case FormFieldTypes.TEXTAREA: {
      return (
        <div className="relative w-full h-[250px]">
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
            onClick={()=>console.log('TODO')}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            reset
          </Button>
        </div>
      )
    }
    case FormFieldTypes.SLIDER: {
      return (
        <div className="w-full flex">
          <Slider
            min={1000}
            max={512000}
            step={1000}
            value={[field.value]}
            onValueChange={(vals) => {
              field.onChange(vals[0]);
            }}
          />
          {!!field.value && 
            <span className="ml-2 min-w-[60px] text-right">
              {field.value.toLocaleString()}
            </span> 
          }
        </div>
      )
    }
    default:
      return null;
  }
};
