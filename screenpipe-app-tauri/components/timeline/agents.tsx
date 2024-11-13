import { StreamTimeSeriesResponse } from "@/app/timeline/page";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

export interface Agent {
  id: string;
  name: string;
  description: string;
  analyze: (
    frames: StreamTimeSeriesResponse[],
    openai: OpenAI,
    options: {
      model: string;
      onProgress: (chunk: string) => void;
    },
    userQuery: string
  ) => Promise<void>;
}

async function streamCompletion(
  openai: OpenAI,
  messages: ChatCompletionMessageParam[],
  userQuery: string,
  options: {
    model: string;
    onProgress: (chunk: string) => void;
  }
) {
  const messagesWithQuery = [
    ...messages,
    {
      role: "user" as const,
      content: `User question: "${userQuery}"\nPlease analyze the data in context of this question.`,
    },
  ];

  const stream = await openai.chat.completions.create({
    model: options.model,
    messages: messagesWithQuery,
    stream: true,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    fullResponse += content;
    options.onProgress(fullResponse);
  }
}

export async function analyzeChunk(
  chunk: any[],
  openai: OpenAI,
  model: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "summarize this chunk of activity in 2-3 sentences, focus on key events and patterns",
      },
      {
        role: "user",
        content: JSON.stringify(chunk),
      },
    ],
  });
  return response.choices[0]?.message?.content || "";
}

export const AGENTS: Agent[] = [
  {
    id: "recursive-summarizer",
    name: "recursive summarizer",
    description:
      "good at processing long time ranges but quality decreases with shorter time ranges",
    analyze: async (
      frames,
      openai,
      { model, onProgress = () => {} },
      userQuery
    ) => {
      if (!frames.length) {
        onProgress("no frames to analyze\n\n");
        return;
      }

      onProgress("analyzing chunks...\n\n");

      const chunkSize = 5 * 60 * 1000;
      const chunks: any[] = [];
      let currentChunk: any[] = [];

      frames.forEach((frame) => {
        const frameTime = new Date(frame.timestamp);
        if (
          currentChunk.length === 0 ||
          frameTime.getTime() - new Date(currentChunk[0].timestamp).getTime() <
            chunkSize
        ) {
          currentChunk.push({
            timestamp: frame.timestamp,
            apps: frame.devices.map((d) => d.metadata.app_name),
            windows: frame.devices.map((d) => d.metadata.window_name),
            text: frame.devices.map((d) => d.metadata.ocr_text).filter(Boolean),
            audio: frame.devices.flatMap((d) => d.audio),
          });
        } else {
          chunks.push(currentChunk);
          currentChunk = [frame];
        }
      });

      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      const chunkSummaries = await Promise.all(
        chunks.map(async (chunk, index) => {
          const summary = await analyzeChunk(chunk, openai, model);
          onProgress(`chunk ${index + 1}/${chunks.length}: ${summary}\n`);
          return {
            time: new Date(chunk[0].timestamp).toLocaleTimeString(),
            summary,
          };
        })
      );

      onProgress("\ncreating final summary...\n\n");

      await streamCompletion(
        openai,
        [
          {
            role: "system",
            content: `create a hierarchical summary with these sections:
                ### overview
                (one paragraph summary of entire time range, focusing on answering the user's question)
                
                ### timeline
                (list of chunk summaries with timestamps)
                
                ### patterns
                (key patterns or insights across chunks)`,
          },
          {
            role: "user",
            content: JSON.stringify({
              timeRange: {
                start: new Date(
                  frames[frames.length - 1].timestamp
                ).toLocaleTimeString(),
                end: new Date(frames[0].timestamp).toLocaleTimeString(),
              },
              chunkSummaries,
            }),
          },
        ],
        userQuery,
        { model, onProgress }
      );
    },
  },
  {
    id: "context-master",
    name: "context master",
    description: "analyzes everything: apps, windows, text & audio",
    analyze: async (frames, openai, { model, onProgress }, userQuery) => {
      const contextData = frames.map((frame) => ({
        timestamp: frame.timestamp,
        devices: frame.devices.map((device) => ({
          device_id: device.device_id,
          metadata: device.metadata,
          audio: device.audio,
        })),
      }));

      await streamCompletion(
        openai,
        [
          {
            role: "system",
            content:
              "analyze all context including apps, windows, text & audio. provide insights about user activity patterns",
          },
          {
            role: "user",
            content: JSON.stringify(contextData),
          },
        ],
        userQuery,
        { model, onProgress }
      );
    },
  },
  {
    id: "window-tracker",
    name: "window tracker",
    description: "focuses on app & window usage data",
    analyze: async (frames, openai, { model, onProgress }, userQuery) => {
      const windowData = frames.map((frame) => ({
        timestamp: frame.timestamp,
        windows: frame.devices.map((device) => ({
          app: device.metadata.app_name,
          window: device.metadata.window_name,
        })),
      }));

      await streamCompletion(
        openai,
        [
          {
            role: "system",
            content:
              "analyze app and window usage patterns, focus on work habits and application transitions",
          },
          {
            role: "user",
            content: JSON.stringify(windowData),
          },
        ],
        userQuery,
        { model, onProgress }
      );
    },
  },
  {
    id: "text-scanner",
    name: "text scanner",
    description: "analyzes visible text (OCR)",
    analyze: async (frames, openai, { model, onProgress }, userQuery) => {
      const textData = frames.map((frame) => ({
        timestamp: frame.timestamp,
        text: frame.devices
          .map((device) => device.metadata.ocr_text)
          .filter(Boolean),
      }));

      await streamCompletion(
        openai,
        [
          {
            role: "system",
            content:
              "analyze OCR text content, identify key topics and information being viewed",
          },
          {
            role: "user",
            content: JSON.stringify(textData),
          },
        ],
        userQuery,
        { model, onProgress }
      );
    },
  },
  {
    id: "voice-analyzer",
    name: "voice analyzer",
    description: "focuses on audio transcriptions",
    analyze: async (frames, openai, { model, onProgress }, userQuery) => {
      const audioData = frames.map((frame) => ({
        timestamp: frame.timestamp,
        audio: frame.devices.flatMap((device) => device.audio),
      }));

      await streamCompletion(
        openai,
        [
          {
            role: "system",
            content:
              "analyze audio transcriptions, identify key conversations and spoken content",
          },
          {
            role: "user",
            content: JSON.stringify(audioData),
          },
        ],
        userQuery,
        { model, onProgress }
      );
    },
  },
];
