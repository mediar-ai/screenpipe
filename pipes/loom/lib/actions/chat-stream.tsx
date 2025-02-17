"use server";
import { OpenAI } from "openai";
import { type Settings } from "@screenpipe/browser"


export async function createChatStream(
  settings: Settings,
  chatMessages: any,
  floatingInput: any,
  data: any,
  abortControllerRef: any
) {
  const openai = new OpenAI({
    apiKey:
      settings.aiProviderType === "screenpipe-cloud"
        ? settings.user.token
        : settings.openaiApiKey,
    baseURL: settings.aiUrl,
    dangerouslyAllowBrowser: true,
  });

  const AGENT = {
    id: "description",
    name: "description generator",
    description: "analyzes the given text and generate description for the video.",
    systemPrompt:
      "you can analyze text which is raw information about a video and provide comprehensive insights.",
  };

  const removeDuplicateLines = (textContent: string[]) => {
    const uniqueLines = Array.from(new Set(textContent));
    if (uniqueLines.length > settings.aiMaxContextChars) {
      return uniqueLines.slice(0, settings.aiMaxContextChars);
    }
    return uniqueLines;
  };

  const model = settings.aiModel;
  const customPrompt = settings.customPrompt || "";
  const context = removeDuplicateLines(data.map(item => item.content.text));
  const messages = [
    {
      role: "system" as const,
      content: `You are a helpful assistant specialized as a "${AGENT.name}". ${AGENT.systemPrompt}
        Rules:
        - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
        - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
        - User timezone offset: ${new Date().getTimezoneOffset()}
        - ${customPrompt ? `Custom prompt: ${customPrompt}` : ""}
        - A same lines can be repeat multiple times, you can ignore the duplicate lines
        - You can ignore the context if user's question is differnet from context as an example user says "hi"
        `,
    },
    ...chatMessages.map((msg: any) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: `Context data: ${context}
      User query: ${floatingInput}`,
    },
  ];

  abortControllerRef.current = new AbortController();

  const stream = await openai.chat.completions.create(
    {
      model: model,
      messages: messages,
      stream: true,
    },
    {
      signal: abortControllerRef.current.signal,
    }
  );

  return stream;
}
