import { OpenAiSetupForm } from "./setup-form";
import { AvailableAiProviders } from "../../types/available-providers";
import { ProviderMetadata } from "../../types/provider-metadata";
import { Settings } from "@/lib/hooks/use-settings";
import OpenAI from "openai";

export const OpenAiProvider: ProviderMetadata = {
    type: AvailableAiProviders.OPENAI,
    title: 'openai',
    description: 'use your own openai api key for gpt-4 and other models',
    imgSrc: '/images/openai.png',
    setupForm: OpenAiSetupForm,
    savedValuesGetter: (settings: Settings) => {
        return {
            aiUrl: settings.aiUrl,
            openaiApiKey: settings.openaiApiKey,
            aiModel: settings.aiModel,
            customPrompt: settings.customPrompt,
            aiMaxContextChars: settings.aiMaxContextChars 
        }
    },
    defaultValuesGetter: () => {
        return {
            aiUrl: 'https://api.openai.com/v1',
            openaiApiKey: '',
            aiModel: 'gpt-4o',
            customPrompt: `Rules:
                - You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
                - Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
                - Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
                - Always answer my question/intent, do not make up things
            `,
            aiMaxContextChars: 512000
        }
    },
    credentialValidation: async (credentials: {openaiApiKey: string, aiModel: string}) => {
        const openai = new OpenAI({
            apiKey: credentials.openaiApiKey,
            dangerouslyAllowBrowser: true
        });
          
        const completion = await openai.chat.completions.create({
            model: credentials.aiModel,
            store: true,
            messages: [
                {"role": "user", "content": "write a haiku about ai"},
            ],
        });

        return completion
    }
}