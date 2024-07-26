// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx

import { Message } from "ai";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { IconOpenAI, IconUser, IconOllama } from "@/components/ui/icons";
import { ChatMessageActions } from "@/components/chat-message-actions";

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  return (
    <div
      className={cn("group relative mb-4 flex items-start md:-ml-12 w-full")}
      {...props}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow",
          message.role === "user"
            ? "bg-background"
            : "bg-primary text-primary-foreground"
        )}
      >
        {message.role === "user" ? (
          <IconUser />
        ) : message.content.includes("Cannot reach local Ollama instance") || message.content.includes("I cannot reach your local Ollama instance") ? (
          <IconOllama />
        ) : (
          <IconOpenAI />
        )}
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden w-[96em]">
        <MemoizedReactMarkdown
          className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
          remarkPlugins={[remarkGfm, remarkMath]}
          components={{
            p({ children }) {
              return <p className="mb-2 last:mb-0">{children}</p>;
            },
            code({ node, className, children, ...props }) {
              const content = String(children).replace(/\n$/, "");
              const match = /language-(\w+)/.exec(className || "");

              console.log("isInline", content, node);
              if (!match) {
                return (
                  <code
                    className="px-1 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-800 font-mono text-sm"
                    {...props}
                  >
                    {content}
                  </code>
                );
              }

              return (
                <CodeBlock
                  key={Math.random()}
                  language={(match && match[1]) || ""}
                  value={content}
                  {...props}
                />
              );
            },
          }}
        >
          {message.content}
        </MemoizedReactMarkdown>
        <ChatMessageActions message={message} />
      </div>
    </div>
  );
}
