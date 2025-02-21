import { ContentItem } from "@screenpipe/js";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import levenshtein from "js-levenshtein";
import { OpenAI } from "openai";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const removeDuplicateSelections = (
    results: ContentItem[],
    selectedResults: Set<number>,
    similarityThreshold: number = 0.9
): Set<number> => {
    const newSelectedResults = new Set<number>();
    const seenContents: string[] = [];

    const getSimilarity = (str1: string, str2: string): number => {
        const maxLength = Math.max(str1.length, str2.length);
        const distance = levenshtein(str1, str2);
        return 1 - distance / maxLength;
    };

    const isDuplicate = (content: string): boolean => {
        return seenContents.some(
            (seenContent) =>
                getSimilarity(content, seenContent) >= similarityThreshold
        );
    };

    Array.from(selectedResults).forEach((index) => {
        const item = results[index];
        if (!item || !item.type) return;

        let content = "";
        if (item.type === "OCR") content = item.content.text;
        else if (item.type === "Audio") content = item.content.transcription;
        else if (item.type === "UI") content = item.content.text;

        if (!isDuplicate(content)) {
            seenContents.push(content);
            newSelectedResults.add(index);
        }
    });

    return newSelectedResults;
}

export async function generateTitle(query: string, settings: any): Promise<string> {
    const openai = new OpenAI({
        apiKey: settings.aiProviderType === "screenpipe-cloud" ? settings.user.token : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
    });

    const response = await openai.chat.completions.create({
        model: settings.aiModel,
        messages: [
            {
                role: "user",
                content: `Generate a concise title for the following query: "${query}". The title should be no more than 50 characters. Only provide the title without any additional text.`,
            },
        ],
    });
    const cleanedContent = response.choices[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>\n?/g, "");
    console.log("After cleaning:", cleanedContent);
    return cleanedContent || "Untitled";
};
