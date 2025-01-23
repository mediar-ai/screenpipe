import { useSettings } from "@/lib/hooks/use-settings";
import { Label } from "@/components/ui/label";
import React, { useState } from "react";
import { AiProviderSelect } from "@/modules/form/components/fields/ai-provider-select";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";
import { RegularProviderSetupForm } from "./provider-setup-forms";
import { EmbeddedControlCenter } from "./embedded-llm/control-center";

const AISection = () => {
  const { settings } = useSettings();
  const [ aiProvider, setAiProvider ] = useState<AvailableAiProviders>(settings.aiProviderType)

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">ai settings</h1>
      <div className="w-full flex flex-col gap-3">
        <Label htmlFor="aiUrl" className="min-w-[80px]">
          ai provider
        </Label>
        <AiProviderSelect
          key={aiProvider}
          setAiProvider={setAiProvider}
          activeAiProvider={aiProvider}
        />
      </div>

      { aiProvider !== AvailableAiProviders.EMBEDDED 
      ? (
          <RegularProviderSetupForm
            aiProvider={aiProvider}
            setAiProvider={setAiProvider}
          />
        )
      : <EmbeddedControlCenter
          aiProvider={aiProvider}
          setAiProvider={setAiProvider}
        />
    }
     
    </div>
  );
};

export default AISection;
