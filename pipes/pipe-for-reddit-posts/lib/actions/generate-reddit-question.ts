"use server";

import { ContentItem } from "@screenpipe/js";
import generateRedditLinks from "./generate-reddit-links";

export default async function generateRedditQuestions(
  screenData: ContentItem[],
  customPrompt: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
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
  const response = await fetch(gptApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: gptModel,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  console.log("reddit questions gpt response:", response);

  if (!response.ok) {
    console.log("gpt response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai reddit questions:", result);

  const content = result.choices[0].message.content;
  return generateRedditLinks(content);
}
