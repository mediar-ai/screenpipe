import { LlamaSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings, store } from "@/lib/hooks/use-settings";

export const NativeLlamaProvider: ProviderMetadata = {
    type: AvailableAiProviders.NATIVE_OLLAMA,
    title: 'ollama',
    description: 'run ai models locally using your existing ollama installation',
    imgSrc: '/images/ollama.png',
    setupForm: LlamaSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            aiUrl: settings.aiUrl,
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    },
    defaultValuesGetter: () => {
        return {
            aiUrl: 'http://localhost:11434/v1',
            customPrompt: `Rules:
                - You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
                - Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
                - Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
                - Always answer my question/intent, do not make up things
            `,
            aiMaxContextChars: 512000
        }
    },
}