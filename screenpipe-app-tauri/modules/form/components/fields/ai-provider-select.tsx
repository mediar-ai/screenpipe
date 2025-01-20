import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { AIProviderCard } from "../../../settings/components/ai-section";
import { SelectContent } from "@/components/ui/select";

export function AiProviderSelect() {
    return (
        <Select.Root defaultValue="screenpipe-cloud">
            <Select.Trigger className="pr-4 flex justify-between items-center rounded-md w-auto border gap-2">
                <Select.Value/>
                <Select.Icon asChild>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
                <SelectContent>
                    <Select.Item value="openai">
                        <Select.ItemIndicator />
                        <Select.ItemText>
                            <AIProviderCard
                                type="openai"
                                title="openai"
                                description="use your own openai api key for gpt-4 and other models"
                                imageSrc="/images/openai.png"
                                selected={true}
                                onClick={() => console.log("openai")}
                            /> 
                        </Select.ItemText>
                    </Select.Item>

                    <Select.Separator />


                    <Select.Item value="screenpipe-cloud">
                        <Select.ItemIndicator />
                        <Select.ItemText>
                            <AIProviderCard
                                type="screenpipe-cloud"
                                title="screenpipe cloud"
                                description="use openai, anthropic and google models without worrying about api keys or usage"
                                imageSrc="/images/screenpipe.png"
                                selected={false}
                                onClick={() => console.log("screenpipe-cloud")}
                                disabled={false}
                            />
                        </Select.ItemText>
                    </Select.Item>

                    <Select.Item value="native-ollama">
                        <Select.ItemIndicator />
                        <Select.ItemText>
                            <AIProviderCard
                                type="native-ollama"
                                title="ollama"
                                description="run ai models locally using your existing ollama installation"
                                imageSrc="/images/ollama.png"
                                selected={false}
                                onClick={() => console.log("native-ollama")}
                            />
                        </Select.ItemText>
                    </Select.Item>

                    <Select.Item value="custom">
                        <Select.ItemIndicator />
                        <Select.ItemText>
                            <AIProviderCard
                                type="custom"
                                title="custom"
                                description="connect to your own ai provider or self-hosted models"
                                imageSrc="/images/custom.png"
                                selected={true}
                                onClick={() => console.log("custom")}
                            />
                        </Select.ItemText>
                    </Select.Item>

                    <Select.Item value="embedded">
                        <Select.ItemIndicator />
                        <Select.ItemText>
                            <AIProviderCard
                                type="embedded"
                                title="embedded ai"
                                description="use the built-in ai engine for offline processing"
                                imageSrc="/images/embedded.png"
                                selected={true}
                                onClick={() => console.log("embedded")}
                            />
                        </Select.ItemText>
                    </Select.Item>
                </SelectContent>
            </Select.Portal>
        </Select.Root>
    )
}
