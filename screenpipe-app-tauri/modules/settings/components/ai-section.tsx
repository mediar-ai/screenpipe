/* eslint-disable @next/next/no-img-element */
import { Settings, useSettings } from "@/lib/hooks/use-settings";
import { Label } from "@/components/ui/label";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Form from "@/modules/form/components/form";
import { AiProviderSelect } from "@/modules/form/components/fields/ai-provider-select";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { useMutation, useQuery } from '@tanstack/react-query'
import { getSetupFormAndPersistedValues } from '@/modules/ai-providers/utils/get-setup-form-and-persisted-values';
import { useToast } from '@/components/ui/use-toast';

interface AIProviderCardProps {
  type: AvailableAiProviders;
  title: string;
  description: string;
  imageSrc: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  warningText?: string;
  imageClassName?: string;
}

export const AIProviderCard = ({
  type,
  title,
  description,
  imageSrc,
  selected,
  onClick,
  disabled,
  imageClassName,
}: AIProviderCardProps) => {
  return (
    <div
      onClick={onClick}
      data-selected={selected}
      data-disabled={disabled}
      className={cn(
        "flex p-4 rounded-lg hover:bg-accent transition-colors cursor-pointer"
      )}
    >
        <div className="flex items-center gap-2">
          <img
            src={imageSrc}
            alt={title}
            data-type={type}
            className={cn(
              "rounded-lg shrink-0 size-12 data-[type=native-ollama]:outline data-[type=native-ollama]:outline-gray-300 data-[type=native-ollama]:outline-1 data-[type=native-ollama]:outline-offset-2",
              imageClassName
            )}
          />
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 items-center">
              <h1 className="text-md leading-none text-left font-medium truncate">
                {title}
              </h1>
            </div>
            <p className="text-[10px] leading-[12px] text-left text-muted-foreground line-clamp-3">
              {description}
            </p>
          </div>
        </div>
    </div>
  );
};

const AISection = () => {
  const { settings, updateSettings, resetSetting } = useSettings();
  const [ aiProvider, setAiProvider ] = useState<AvailableAiProviders>(AvailableAiProviders.OPENAI)

  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ['setupForm', aiProvider],
    queryFn: async () => {
      const result = await getSetupFormAndPersistedValues({
        activeAiProvider: settings.aiProviderType,
        selectedAiProvider: aiProvider,
        settings
      })
      return result
    }
  })

  const { mutate, isPending } = useMutation({
    mutationFn: async (values: Partial<Settings>) => {
      console.log({values})
      // updateSettings({
      //   ...values
      // });
    },
    onSuccess: () => {
      toast({
        title: "ai provider info updated",
      });
    }, 
    onError: () => {
      toast({
        title: "ai provider info updated",
        variant: 'destructive'
      });
    }
  })
  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">ai settings</h1>
      <div className="w-full flex flex-col gap-3">
        <Label htmlFor="aiUrl" className="min-w-[80px]">
          ai provider
        </Label>
        <AiProviderSelect
          setAiProvider={setAiProvider}
          activeAiProvider={aiProvider}
        />
      </div>
      {data?.setupForm && 
        <Form
          defaultValues={data.defaultValues}
          isLoading={isPending}
          onCreate={async (values) => mutate(values)}
          key={aiProvider}
          form={data.setupForm}
        />
      }
    </div>
  );
};

export default AISection;
