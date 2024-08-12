import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { z } from "zod";
import { Separator } from "./ui/separator";
import { Pipe } from "@/lib/hooks/use-pipes";
import { CheckIcon, CopyIcon } from "lucide-react";
import { spinner } from "./spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import { streamText } from "ai";
import { ChatMessage } from "./chat-message-v2";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { usePostHog } from "posthog-js/react";

const screenpipeQuery = z.object({
  q: z
    .string()
    .describe(
      "The search query matching exact keywords. Use a single keyword that best matches the user intent. This would match either audio transcription or OCR screen text. Example: do not use 'discuss' the user ask about conversation, this is dumb, won't return any result"
    )
    .optional(),
  content_type: z
    .enum(["ocr", "audio", "all"])
    .default("all")
    .describe(
      "The type of content to search for: screenshot data or audio transcriptions"
    ),
  limit: z
    .number()
    .default(20)
    .describe(
      "Number of results to return (default: 20). Don't return more than 50 results as it will be fed to an LLM"
    ),
  offset: z.number().default(0).describe("Offset for pagination (default: 0)"),
  start_time: z
    .string()
    .default(new Date(Date.now() - 3600000).toISOString())
    .describe("Start time for search range in ISO 8601 format"),
  end_time: z
    .string()
    .default(new Date().toISOString())
    .describe("End time for search range in ISO 8601 format"),
  app_name: z
    .string()
    .describe(
      "The name of the app the user was using. This filter out all audio conversations. Only works with screen text. Use this to filter on the app context that would give context matching the user intent. For example 'cursor'. Use lower case. Browser is usually 'arc', 'chrome', 'safari', etc. Do not use thing like 'mail' because the user use the browser to read the mail."
    )
    .optional(),
});

async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    console.log("params", params);
    const queryParams = new URLSearchParams(
      Object.entries({
        q: params.q,
        offset: params.offset.toString(),
        limit: params.limit.toString(),
        start_time: params.start_time,
        end_time: params.end_time,
        content_type: params.content_type,
        app_name: params.app_name,
      }).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} ${text}`);
    }
    const result = await response.json();
    console.log("result", result);
    return result;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

// Add this new function after the existing functions and before the MeetingSummarizer component
const filterTranscriptErrors = (transcript: string): string => {
  const errorPatterns = [
    /<\|\d+\.\d+\|>/g,
    /^(Thank you\.|See you next time!|Bye!|Hey\.)$/gm,
  ];

  console.log("before transcript", transcript);

  let filteredTranscript = transcript;
  errorPatterns.forEach((pattern) => {
    filteredTranscript = filteredTranscript.replace(pattern, "");
  });

  console.log("after transcript", filteredTranscript);

  // Remove extra whitespace and empty lines
  return filteredTranscript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
};

export const MeetingSummarizer = ({ pipe }: { pipe: Pipe }) => {
  const [meetingStartTime, setMeetingStartTime] = useState<Date | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [processedTranscript, setProcessedTranscript] = useState<string>("");
  const { settings } = useSettings();
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const [lastProcessedTimestamp, setLastProcessedTimestamp] = useState<
    string | null
  >(null);
  const [processedHashes, setProcessedHashes] = useState<Set<string>>(
    new Set()
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const transcriptQueueRef = useRef<string[]>([]);
  const processingPromiseRef = useRef<Promise<void> | null>(null);
  const [useAi, setUseAi] = useState(false);
  const posthog = usePostHog();

  const handleStartMeeting = () => {
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() + 1); // Add 1 minute
    setMeetingStartTime(startDate);
    setIsStreaming(true);
    setTranscript("");
    setProcessedTranscript("");
    setLastProcessedTimestamp(null);
    posthog.capture("meeting_started", {
      userId: settings.userId,
    });
  };

  const handleStopMeeting = () => {
    setIsStreaming(false);
    setMeetingStartTime(null);
  };

  const processTranscriptChunk = async (chunk: string) => {
    if (isProcessing) {
      transcriptQueueRef.current.push(chunk);
      return;
    }

    setIsProcessing(true);

    const processChunk = async () => {
      try {
        const baseUrl = settings.ollamaUrl.includes("/api")
          ? settings.ollamaUrl
          : settings.ollamaUrl + "/api";
        const provider = settings.useOllama
          ? createOllama({ baseURL: baseUrl })
          : createOpenAI({ apiKey: settings.openaiApiKey });

        const { textStream } = await streamText({
          model: provider(settings.aiModel),
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that receive small chnuks of transcriptions from a meeting or audio.
              It uses Whisper to transcribe the audio or other AI model that can make mistakes.
              
              Remove noise and transcription errors from the following text, keeping the essential content.
              
              Typical errors from Whisper model or other are:
              - Thank you...
              - Weird chinese characters ...
              - Subscribe now ...
              - etc.

              Rules:
              - DO NOT FUCKING SAY ANYTHING BUT THE FIXED TRANSCRIPT DO NOT FUCKING COMMENT ON IT OR THE UNIVERSE WILL COLLAPSE
              - DO NOT FUCKING TRY TO SUMMARIZE THE TRANSCRIPT, JUST FIX THE TRANSCRIPT
              - DO MINIMAL CHANGES, ONLY IF NECESSARY
              `,
            },
            {
              role: "user",
              content: chunk,
            },
          ],
        });

        let processedChunk = "";
        for await (const text of textStream) {
          processedChunk += text;
          setProcessedTranscript((prev) => prev + text);
        }
        // add linebreak at the end of the transcript
        setProcessedTranscript((prev) => prev + "\n");
      } catch (error) {
        console.error("Error processing transcript chunk:", error);
      } finally {
        setIsProcessing(false);
      }
    };

    processingPromiseRef.current = processChunk();
    await processingPromiseRef.current;
    processNextChunkInQueue();
  };

  const processNextChunkInQueue = () => {
    if (transcriptQueueRef.current.length > 0) {
      const nextChunk = transcriptQueueRef.current.shift();
      if (nextChunk) {
        processTranscriptChunk(nextChunk);
      }
    }
  };

  const hashTranscript = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const pollTranscript = async () => {
      if (isStreaming && meetingStartTime) {
        try {
          const endTime = new Date();
          const screenpipeResults = await queryScreenpipe({
            content_type: "audio",
            start_time:
              lastProcessedTimestamp || meetingStartTime.toISOString(),
            end_time: endTime.toISOString(),
            limit: 100,
            offset: 0,
          });

          if (
            screenpipeResults &&
            screenpipeResults.data &&
            screenpipeResults.data.length > 0
          ) {
            let newTranscriptText = "";

            for (const result of screenpipeResults.data) {
              const transcriptHash = await hashTranscript(
                result.content.transcription
              );
              if (!processedHashes.has(transcriptHash)) {
                newTranscriptText += result.content.transcription + "\n";
                processedHashes.add(transcriptHash);
                setProcessedHashes(processedHashes);
              }
            }

            if (newTranscriptText) {
              const filteredTranscript =
                filterTranscriptErrors(newTranscriptText);
              setTranscript((prev) => prev + newTranscriptText);
              if (useAi) {
                await processTranscriptChunk(newTranscriptText);
              } else {
                setProcessedTranscript(
                  (prev) => prev + newTranscriptText + "\n---\n"
                );
              }
            }

            // Update the last processed timestamp
            const lastResult =
              screenpipeResults.data[screenpipeResults.data.length - 1];
            setLastProcessedTimestamp(lastResult.timestamp);
          }
        } catch (error) {
          console.error("Error polling transcript:", error);
        }
      }
    };

    if (isStreaming) {
      intervalId = setInterval(pollTranscript, 5000); // Poll every 2 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // ignore eslint shit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, meetingStartTime, settings]);

  return (
    <div className="flex flex-col h-full ">
      <h2 className="text-2xl font-bold mb-2">
        Local First Meeting Summarizer
      </h2>
      <div className="flex flex-col space-y-2">
        <Label>by: Screenpipe</Label>
        <Label>version: 1.0.0</Label>
        <div className="flex space-x-2 items-center ">
          <Switch
            checked={useAi}
            onCheckedChange={setUseAi}
            disabled={isStreaming}
          />
          <Label htmlFor="use-ai" className="mb-1">
            Use AI processing
            <Badge variant="outline" className="text-xs w-fit p-2">
              experimental
            </Badge>
          </Label>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        AI processing uses your configured{" "}
        {settings.useOllama ? "Ollama" : "OpenAI"} settings
      </p>
      <Tabs
        defaultValue="controls"
        className="flex-grow flex flex-col w-[600px]"
      >
        <TabsList className="bg-background flex justify-start">
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <Separator orientation="vertical" />
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          {isStreaming && (
            <div className="flex items-center space-x-2">
              {spinner}
              <span>Streaming transcript...</span>
            </div>
          )}
        </TabsList>
        <div className="flex-grow overflow-hidden">
          <TabsContent value="controls" className="h-full ">
            <p className="mb-4">{pipe.description}</p>
            <div className="flex space-x-2 mb-4">
              <Button onClick={handleStartMeeting} disabled={isStreaming}>
                Start Meeting
              </Button>
              <Button onClick={handleStopMeeting} disabled={!isStreaming}>
                Stop Meeting
              </Button>
            </div>
            {meetingStartTime && (
              <p className="mb-4">
                Meeting started at: {meetingStartTime.toLocaleTimeString()}
              </p>
            )}
          </TabsContent>
          <TabsContent value="transcript" className="h-full ">
            <div className="space-y-4 space-x-4">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(processedTranscript)}
                disabled={!processedTranscript}
              >
                {isCopied ? (
                  <CheckIcon className="mr-2 h-4 w-4" />
                ) : (
                  <CopyIcon className="mr-2 h-4 w-4" />
                )}
                {isCopied ? "Copied" : "Copy Transcript"}
              </Button>
              {useAi && (
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(transcript)}
                  disabled={!transcript}
                >
                  {isCopied ? (
                    <CheckIcon className="mr-2 h-4 w-4" />
                  ) : (
                    <CopyIcon className="mr-2 h-4 w-4" />
                  )}
                  {isCopied ? "Copied" : "Copy Raw Transcript"}
                </Button>
              )}
              <ChatMessage
                message={{
                  id: "1",
                  role: "assistant",
                  content: processedTranscript,
                }}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
