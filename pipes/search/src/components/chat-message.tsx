import { Message } from "ai";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useState, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "@/components/markdown";
import {
  IconOpenAI,
  IconUser,
  IconClaude,
  IconGemini,
} from "@/components/ui/icons";
import { ChatMessageActions } from "@/components/chat-message-actions";
import { useSettings } from "@/lib/hooks/use-settings";
import { VideoComponent } from "./video";
import { ArrowDown, ChevronDown } from "lucide-react";

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  const { settings } = useSettings();
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState<string[]>([]);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!message?.content) return;

    const openTag = /<think>/g.test(message.content);
    const closeTag = /<\/think>/g.test(message.content);

    const matches = message.content.match(/<think>([\s\S]*?)(?:<\/think>|$)/g);
    if (matches) {
      const contents = matches.map((match) =>
        match.replace(/<think>|<\/think>/g, "").trim(),
      );
      setThinkingContent(contents);
    }

    if (openTag && !closeTag) {
      setIsThinking(true);
    } else if (openTag && closeTag) {
      setIsThinking(true);
      clearTimeout(timerRef.current ?? undefined);
    } else {
      setIsThinking(false);
      setThinkingContent([]);
      setThinkingTime(0);
    }
  }, [message.content]);

  useEffect(() => {
    if (isThinking) {
      timerRef.current = setInterval(() => {
        setThinkingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      clearInterval(timerRef.current ?? undefined);
    };
  }, [isThinking]);

  const processThinkContent = (content: string) => {
    return content.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  };

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
            : "bg-primary text-primary-foreground",
        )}
      >
        {message.role === "user" ? (
          <IconUser />
        ) : settings?.aiModel?.includes("gpt") ? (
          <IconOpenAI />
        ) : settings?.aiModel?.includes("claude") ? (
          <IconClaude />
        ) : settings?.aiModel?.includes("gemini") ? (
          <IconGemini />
        ) : (
          <>🦙</>
        )}
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden w-[96em]">
        {isThinking && thinkingContent.length > 0 && (
          <div
            className={cn(
              "my-2 rounded-lg border transition-all duration-300",
              "bg-muted/50 border-muted-foreground/20 text-muted-foreground",
            )}
          >
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full p-3 flex items-center gap-2 hover:bg-muted/70 transition-colors"
            >
              <span className="animate-pulse">💭</span>
              <span className="text-sm text-muted-foreground flex-1 text-left">
                {isThinking
                  ? `Thinking... (${thinkingTime}s)`
                  : `Thought for ${thinkingTime}s`}
              </span>
              <span
                className={cn(
                  "transform transition-transform duration-200",
                  isExpanded ? "rotate-180" : "",
                )}
              >
                <ChevronDown />
              </span>
            </button>
            <div
              className={cn(
                "transition-all duration-300 overflow-hidden",
                isExpanded ? "opacity-100" : "max-h-0 opacity-0",
              )}
            >
              <div className="p-3 pt-0">
                <div className="pl-4 border-l-2 border-muted-foreground/20">
                  {thinkingContent.map((content, index) => (
                    <p key={index} className="mb-2 last:mb-0">
                      {content}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
          {processThinkContent(message.content)}
        </MemoizedReactMarkdown>
        <ChatMessageActions message={message} />
      </div>
    </div>
  );
}
