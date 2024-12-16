import { Message } from "ai";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { IconOpenAI, IconUser, IconOllama } from "@/components/ui/icons";
import { ChatMessageActions } from "@/components/chat-message-actions";
import { useSettings } from "@/lib/hooks/use-settings";
import { VideoComponent } from "./video";

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  const { settings } = useSettings();

  const hasMP4File = (content: string) =>
    content.trim().toLowerCase().includes(".mp4");

  if (!message?.content?.trim()) {
    return null;
  }

  return (
    <div
      className={cn("group relative mb-4 flex items-start w-full")}
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
        ) : settings.aiUrl.includes("openai") ||
          settings.aiUrl.includes("worker") ? (
          <IconOpenAI />
        ) : (
          <>🦙</>
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
            a({ node, href, children, ...props }) {
              const isMP4Link = href?.toLowerCase().includes(".mp4");

              if (isMP4Link && href) {
                return <VideoComponent filePath={href} />;
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                >
                  {children}
                </a>
              );
            },
            code({ node, className, children, ...props }) {
              const content = String(children).replace(/\n$/, "");
              const match = /language-(\w+)/.exec(className || "");

              const isMP4File = hasMP4File(content);

              if (isMP4File || !match) {
                if (isMP4File) {
                  return <VideoComponent filePath={content.trim()} />;
                }
                return (
                  <code
                    className="px-1 py-0.5 rounded-sm font-mono text-sm"
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
