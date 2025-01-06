"use server";
import { OpenAI } from "openai";
import { ContentItem } from "@screenpipe/js";
import { DailyLog } from "../types";

export default async function generateDailyLog(
  screenData: ContentItem[],
  dailylogPrompt: string,
  aiProviderType: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string,
  userToken: string
): Promise<DailyLog> {
  const prompt = `${dailylogPrompt}

    Based on the following screen data, generate a concise daily log entry:

    ${JSON.stringify(screenData)}

    Return a JSON object with the following structure:
    {
        "activity": "Brief description of the activity",
        "category": "Category of the activity like work, email, slack, etc"
        "tags": ["productivity", "work", "email", "john", "salesforce", "etc"]
    }
        
    
    Rules:
    - Do not add backticks to the JSON eg \`\`\`json\`\`\` is WRONG
    - DO NOT RETURN ANYTHING BUT JSON. NO COMMENTS BELOW THE JSON.
        
    `;

  const openai = new OpenAI({
    apiKey: aiProviderType === "screenpipe-cloud" ? userToken : openaiApiKey,
    baseURL: gptApiUrl,
    dangerouslyAllowBrowser: true,
  })

  const response = await openai.chat.completions.create({
    model: gptModel,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("gpt response for log:", response);
  if (!response.choices || response.choices.length === 0) {
    throw new Error("no choices returned from openai, please try again");
  }

  const messageContent = response.choices[0]?.message?.content;
  if (!messageContent) {
    throw new Error("no content returned from openAI");
  }

  console.log("ai answer:", response);
  // clean up the result
  const cleanedResult = messageContent
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "") // remove start and end code block markers
    .replace(/\n/g, "") // remove newlines
    .replace(/\\n/g, "") // remove escaped newlines
    .trim(); // trim any remaining whitespace

  let content;
  try {
    content = JSON.parse(cleanedResult);
    console.log("JSON content:", content);
  } catch (error) {
    console.warn("failed to parse ai response:", error);
    console.warn("cleaned result:", cleanedResult);
    throw new Error("invalid ai response format");
  }

  return content;
}
