"use server";
import { OpenAI } from "openai";

export async function generateTitle(query: string, settings: any): Promise<string> {
  const openai = new OpenAI({
    apiKey: settings.aiProviderType === "screenpipe-cloud" ? settings.user.token : settings.openaiApiKey,
    baseURL: settings.aiUrl,
  });

  const response = await openai.chat.completions.create({
    model: settings.aiModel,
    messages: [
      {
        role: "user",
        content: 
`Generate a concise title for the following query: "${query}".
The title should be no more than 50 characters.
Only provide the title without any additional text.`,
      },
    ],
  });
  const cleanedContent = response.choices[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>\n?/g, "");
  console.log("After cleaning:", cleanedContent);
  return cleanedContent || "Untitled";
};

