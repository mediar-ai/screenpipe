"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { AIPresetsDialog } from "@/components/ai-presets-dialog";
import { AIPresetsSelector } from "@/components/ai-presets-selector";

export const Assistant = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[200px_1fr] gap-x-2 px-4 py-4">
        <ThreadList />
        <Thread />
        {/* <AIPresetsDialog pipeName="hello-world-computer-use" /> */}
        <AIPresetsSelector pipeName="hello-world-computer-use" />
      </div>
    </AssistantRuntimeProvider>
  );
};
