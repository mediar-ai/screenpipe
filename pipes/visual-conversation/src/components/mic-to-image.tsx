"use client";

import { pipe } from "@screenpipe/browser";
import { useEffect, useState, useRef } from "react";
import { Mic } from "lucide-react";
import { getImageFromHistory, queuePrompt } from "@/lib/actions/comfyui-query";

const SERVER_ADDRESS = "0.0.0.0:8188";

export function MicToImage() {
  const [transcription, setTranscription] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());

  async function generateImage(prompt: string) {
    setIsGenerating(true);

    try {
      // Connect to WebSocket if not already connected
      if (!wsRef.current) {
        wsRef.current = new WebSocket(
          `ws://${SERVER_ADDRESS}/ws?clientId=${clientId.current}`
        );
      }

      const { prompt_id } = await queuePrompt(prompt);

      console.log("prompt_id", prompt_id);

      // Listen for WebSocket messages
      wsRef.current.onmessage = async (event) => {
        console.log("message", event.data);
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "executing" && message.data.node === null) {
            // Execution completed, fetch the image
            const imageUrl = await getImageFromHistory(prompt_id);
            if (imageUrl) {
              setImageUrl(imageUrl);
              setIsGenerating(false);
            }
          }
        }
      };
    } catch (error) {
      console.error("error generating image:", error);
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    async function startTranscriptionMonitor() {
      try {
        for await (const chunk of pipe.streamTranscriptions()) {
          const text = chunk.choices[0].text;
          setTranscription((transcription) => transcription + text);
        }
      } catch (error) {
        console.error("transcription error:", error);
      }
    }

    startTranscriptionMonitor();
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2">
        <Mic className="w-6 h-6" />
        <span className="text-lg">speak something...</span>
      </div>

      {transcription && (
        <div className="w-full p-4 rounded-lg bg-gray-100 dark:bg-gray-900">
          <p className="text-sm font-mono">{transcription}</p>
          <button
            onClick={() => generateImage(transcription)}
            disabled={isGenerating}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "generating..." : "generate image"}
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="w-full h-[512px] flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
        </div>
      )}

      {imageUrl && !isGenerating && (
        <img
          src={imageUrl}
          alt="generated from speech"
          className="w-full rounded-lg shadow-lg"
        />
      )}
    </div>
  );
}
