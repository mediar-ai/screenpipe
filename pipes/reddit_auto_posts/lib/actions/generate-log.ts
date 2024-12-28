"use server";
import { ContentItem } from "@screenpipe/js";
import { DailyLog } from "../types";

export default async function generateDailyLog(
  screenData: ContentItem[],
  dailylogPrompt: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
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

  const response = await fetch(gptApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: gptModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.log("gpt response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai answer:", result);
  // clean up the result
  const cleanedResult = result.choices[0].message.content
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "") // remove start and end code block markers
    .replace(/\n/g, "") // remove newlines
    .replace(/\\n/g, "") // remove escaped newlines
    .trim(); // trim any remaining whitespace

  let content;
  try {
    content = JSON.parse(cleanedResult);
  } catch (error) {
    console.warn("failed to parse ai response:", error);
    console.warn("cleaned result:", cleanedResult);
    throw new Error("invalid ai response format");
  }

  return content;
}
