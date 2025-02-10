"use client";

import { pipe } from "@screenpipe/browser";
import { useEffect, useState, useRef } from "react";
import { Mic } from "lucide-react";
import { getImageFromHistory, queuePrompt } from "@/lib/actions/comfyui-query";
import { OllamaModelsList } from "./ollama-models-list";
import { generateObject, generateText } from "ai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";

const SERVER_ADDRESS = "0.0.0.0:8188";
const POLL_INTERVAL = 1 * 10 * 1000; // 5 minutes

export function MicToImage() {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());
  const [selectedModel, setSelectedModel] = useState(
    "llama3.2:3b-instruct-q4_K_M"
  );

  async function queryRecentConversation() {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5000 * 60 * 1000);
    const response = await pipe.queryScreenpipe({
      contentType: "audio",
      // startTime: fiveMinutesAgo.toString(),
      // endTime: now.toString(),
      limit: 10,
    });

    console.log("response", response);

    if (!response?.data) return "";

    // Combine all transcriptions into one text
    return response.data
      .map((r) => {
        if (r.type === "Audio") {
          return r.content.transcription;
        }
        return "";
      })
      .join(" ");
  }

  async function generatePrompt(conversation: string) {
    console.log("conversation", conversation);
    const result = await generateText({
      model: ollama(selectedModel),
      prompt: `Based on this conversation transcription, generate a detailed image prompt: "${conversation}" this will be used to generate an image using an AI image generator
      
      Examples:
      - "John and Alice discuss the weather and you suggest: 'A beautiful sunset over a calm ocean'"
      - "Lee and Fu discuss their trip to the moon and you suggest: 'A rocketship landing on the moon'"
      `,
    });
    console.log("result", result);

    return result.text;
  }

  async function generateImage(prompt: string) {
    setIsGenerating(true);
    try {
      if (!wsRef.current) {
        wsRef.current = new WebSocket(
          `ws://${SERVER_ADDRESS}/ws?clientId=${clientId.current}`
        );
      }

      const { prompt_id } = await queuePrompt(prompt);
      console.log("prompt_id", prompt_id);

      wsRef.current.onmessage = async (event) => {
        console.log("message", event.data);
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (
            message.type === "progress" &&
            message.data.node === null &&
            message.data.value === message.data.max
          ) {
            setTimeout(async () => {
              const imageUrl = await getImageFromHistory(prompt_id);
              if (imageUrl) {
                setImageUrl(imageUrl);
                setIsGenerating(false);
              }
            }, 2000);
          }
        }
      };
    } catch (error) {
      console.error("error generating image:", error);
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      const conversation = await queryRecentConversation();
      console.log("conversation", conversation);
      if (conversation) {
        const prompt = await generatePrompt(conversation);
        await generateImage(prompt);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [selectedModel]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2">
        <Mic className="w-6 h-6" />
        <span className="text-lg">recording conversation...</span>
      </div>

      <div className="w-full">
        <OllamaModelsList
          defaultValue={selectedModel}
          onChange={setSelectedModel}
          disabled={isGenerating}
        />
      </div>

      {isGenerating && (
        <div className="w-full h-[512px] flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
        </div>
      )}

      {imageUrl && !isGenerating && (
        <img
          src={imageUrl}
          alt="generated from conversation"
          className="w-full rounded-lg shadow-lg"
        />
      )}
    </div>
  );
}
