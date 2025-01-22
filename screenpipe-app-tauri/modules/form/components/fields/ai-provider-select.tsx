import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { SelectContent } from "@/components/ui/select";
import { AvailableAiProviders } from '../../../ai-providers/types/available-providers';
import { AiProviders } from "@/modules/ai-providers/providers";
import { AIProviderCard } from "@/modules/settings/components/ai-section/ai-provider-card";


export function AiProviderSelect({
    activeAiProvider,
    setAiProvider
} : {
    activeAiProvider: AvailableAiProviders,
    setAiProvider: React.Dispatch<React.SetStateAction<AvailableAiProviders>>
}) {
    return (
        <Select.Root 
            defaultValue={activeAiProvider} 
            onValueChange={(value) => setAiProvider(value as AvailableAiProviders)}
        >
            <Select.Trigger className="pr-4 flex justify-between items-center rounded-md w-auto border gap-2">
                <Select.Value/>
                <Select.Icon asChild>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
                <SelectContent>
                    {Object.values(AiProviders).map((provider) => 
                        <>
                            <Select.Item value={provider.type}>
                                <Select.ItemIndicator />
                                <Select.ItemText>
                                    <AIProviderCard
                                        type={provider.type}
                                        title={provider.title}
                                        description={provider.description}
                                        imageSrc={provider.imgSrc}
                                        selected={true}
                                        onClick={() => console.log("openai")}
                                    /> 
                                </Select.ItemText>
                            </Select.Item> 
                            <Select.Separator />
                        </>
                    )}
                </SelectContent>
            </Select.Portal>
        </Select.Root>
    )
}
