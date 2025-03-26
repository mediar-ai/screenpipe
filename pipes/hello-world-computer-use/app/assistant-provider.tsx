"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { AIPresetsSelector } from "@/components/ai-presets-selector";

export const AssistantProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const runtime = useChatRuntime({
    api: "/api/chat",
    onError: (error) => {
      console.error("error", error);
    },
    onResponse: async (response) => {
      console.log("response", await response.text());
    },
    onFinish: (response) => {
      console.log("finish", response);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
};
