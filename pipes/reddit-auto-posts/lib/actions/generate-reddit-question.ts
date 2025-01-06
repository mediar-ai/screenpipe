"use server";

import { OpenAI } from "openai";
import { ContentItem } from "@screenpipe/js";
import generateRedditLinks from "./generate-reddit-links";

export default async function generateRedditQuestions(
  screenData: ContentItem[],
  customPrompt: string,
  aiProviderType: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string,
  userToken: string
): Promise<string> {
  const prompt = `${customPrompt}

  based on the following screen data, generate a list of questions i can ask the reddit community:

  ${JSON.stringify(screenData)}

  rules:
  - be specific and concise
  - return a list of posts, one level bullet list
  - keep the tone casual like you are chatting to friends
  - you can mention some context from the screen data 30% of the time, but don't mention very personal data
  - the list should be enumerated with square brackets like [1], [2], ...
  - each post starts with [TITLE] ... [/TITLE], then [BODY] ... [/BODY],
  - at the end of each post add a list of subreddits to post it in enumerated as [r/...], [r/....], [r/....], ...
  - at the end of each subreddit add "[SEND]"
  `;

  console.log("reddit questions prompt:", prompt);
  const openai = new OpenAI({
    apiKey:
      aiProviderType === "screenpipe-cloud"
      ? userToken
      : openaiApiKey,
    baseURL: gptApiUrl,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.chat.completions.create({
    model: gptModel,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("reddit questions gpt response:", response);
  if (!response.choices || response.choices.length === 0) {
    throw new Error("no choices returned from openai");
  }

  const content = response.choices[0].message.content;
  if(!content){
    throw new Error("no content response got from ai, please try again");
  }
  return generateRedditLinks(content);
}
