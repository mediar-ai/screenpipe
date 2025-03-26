"use client";
import {
  getExternalStoreMessages,
  useAssistantToolUI,
  useInlineRender,
  useMessage,
} from "@assistant-ui/react";
import { AIPresetsSelector } from "./ai-presets-selector";
import { Thread } from "./assistant-ui/thread";
import { ThreadList } from "./assistant-ui/thread-list";

export const Chat = () => {
  useAssistantToolUI({
    toolName: "open_url",
    render: useInlineRender(({ args, status }) => {
      // you can access component props here
      return (
        <p>
          {JSON.stringify(args)}
          {JSON.stringify(status)}
        </p>
      );
    }),
  });
  return (
    <div className="grid h-dvh grid-cols-[200px_1fr] gap-x-2 px-4 py-4">
      <ThreadList />

      <Thread />
      <AIPresetsSelector pipeName="hello-world-computer-use" />
    </div>
  );
};
