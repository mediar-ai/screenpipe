import { FormSchema } from "../../form/entities/form";
import { AiProviders } from "../providers";
import { getOllamaModels } from "../providers/native-llama/utils";
import { AvailableAiProviders } from "../types/available-providers";
import { Settings } from '../../../lib/hooks/use-settings';

export async function getSetupFormAndPersistedValues({
    activeAiProvider,
    selectedAiProvider,
    settings
}: {
    activeAiProvider: AvailableAiProviders, 
    selectedAiProvider: AvailableAiProviders
    settings: Settings
}): Promise<{ setupForm: FormSchema, defaultValues: Record<string, string> | undefined }> {
    let setupForm
    let defaultValues

    // 1. Define form
    if (selectedAiProvider !== AvailableAiProviders.NATIVE_OLLAMA) {
        setupForm = AiProviders[selectedAiProvider].setupForm
    } else {
        const formWithoutOptions = AiProviders[selectedAiProvider].setupForm
        const ollamaModels = await getOllamaModels()

        // Find aiModel field and inject options
        formWithoutOptions.fields.forEach((field, index) => {
            if (!field.typeMeta.isRegular && field.key === 'aiModel') {
                formWithoutOptions.fields[index].typeMeta.options = ollamaModels.models.map((model) => model.name)
            }
        })

        setupForm = {...formWithoutOptions}
    }

    // 2. Define default values
    if (selectedAiProvider !== activeAiProvider) {
        defaultValues = await AiProviders[selectedAiProvider].defaultValuesGetter(settings) as Record<string, string>
    } else {
        defaultValues = await AiProviders[selectedAiProvider].savedValuesGetter(settings) as Record<string, string>
    }

    return { setupForm, defaultValues }
}