"use client"
import { zodResolver } from "@hookform/resolvers/zod";
import { ForwardRefRenderFunction, PropsWithoutRef, useImperativeHandle, useMemo } from "react";
import React from "react";
import { type SubmitHandler, type FieldValues, type DefaultValues, useForm, Path, useFormState, UseFormReset } from "react-hook-form";
import { z, ZodRawShape } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FieldSchema } from "../entities/field/field-metadata";
import { FormFieldRenderer } from "./field-renderer";
import { ButtonWithLoadingState } from "@/components/ui/button-with-loading-state";
import { FormStatus } from "../form-status";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { InfoTooltip } from "./fields/info-tooltip";

export interface FormRendererHandles<FormValues> {
  reset: (values?: FormValues) => void;
  getValues: () => FormValues;
}

export interface FormRendererProps<FormValues extends FieldValues> {
  title: string;
  description?: string | null;
  fields: FieldSchema[];
  defaultValues?: DefaultValues<FormValues>;
  formZodSchema: z.ZodObject<ZodRawShape>;
  showInternalButton?: boolean;
  showSubmitButton?: boolean;
  controlledShowSubmitButton?: boolean;
  hideTitle?: boolean,
  isDirty?: boolean,
  buttonText: string;
  onSubmit: SubmitHandler<FormValues>;
  resetForm(): Promise<void>
  isLoading?: boolean;
}

export const InternalFormRenderer = <FormValues extends FieldValues>(
  props: FormRendererProps<FormValues>,
  ref: React.ForwardedRef<FormRendererHandles<FormValues>>
) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(props.formZodSchema),
    defaultValues: props.defaultValues,
  });

  useImperativeHandle(ref, () => ({
    reset(values?: FormValues) {
      if (values) {
        form.reset(values, { keepDefaultValues: false })
      } else {
        form.reset()
      }
    },
    getValues() {
      return form.getValues();
    },
  }));

  const showSubmitButton = useMemo(() => {
    if (props.controlledShowSubmitButton) {
      return props.controlledShowSubmitButton
    }
    
    return (form.formState.isDirty || props.showSubmitButton)
  }, [
      form.formState.isDirty,
      props.showSubmitButton, 
      props.controlledShowSubmitButton
  ])

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();

          form
            .handleSubmit(props.onSubmit)(event)
        }}
        className="flex w-[100%] min-h-[100%] flex-col space-y-8 p-1 pb-[10px]"
      >
        {!props.hideTitle &&
          <div className="flex min-h-[40px] justify-between items-end">
            <div className="flex flex-col justify-end space-y-1">
              <Label>
                {props.title}
              </Label>
              {!!props.description && (
                <p className="text-sm text-muted-foreground">
                  {props.description}
                </p>
              )}
            </div>
            <FormStatus
              isDirty={props.isDirty}
              reset={props.resetForm}
            />
          </div>
        }
        {props.fields.map((element, index, { length }) => {
          return (
            <FormField
              key={element.key}
              name={element.key as Path<FormValues>}
              control={form.control}
              render={({ field }) => {
                return (
                  <FormItem className="flex flex-col justify-center space-y-2">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center">
                          <FormLabel>
                            {element.title}
                          </FormLabel>
                          { !!element.infoTooltip && (
                            <InfoTooltip
                              text={element.infoTooltip}
                            />
                          )}
                        </div>
                        <FormDescription>
                          {element.description}
                        </FormDescription>
                      </div>
                    <FormControl> 
                      <FormFieldRenderer
                        element={element}
                        form={form}
                        isLast={length - 1 === index}
                        isLoading={props.isLoading}
                        showInternalButton={props.showInternalButton}
                        field={field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              }
            />
          )
        })}

        { (showSubmitButton || props.isDirty) && (
          <ButtonWithLoadingState
            isLoading={props.isLoading}
            label={props.buttonText}
            type={"submit"}
          />
        )}
      </form>
    </Form>
  );
};
InternalFormRenderer.displayName = "FormRenderer";

function fixedForwardRef<T, FormRendererProps>(
  render: ForwardRefRenderFunction<T, PropsWithoutRef<FormRendererProps>>,
): (props: FormRendererProps & React.RefAttributes<T>) => React.ReactElement {
  return React.forwardRef(render) as any;
}
export const FormRenderer = fixedForwardRef(InternalFormRenderer);
