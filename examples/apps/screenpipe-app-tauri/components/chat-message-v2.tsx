import { Message } from "ai";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useState, useEffect, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { IconOpenAI, IconUser, IconOllama } from "@/components/ui/icons";
import { ChatMessageActions } from "@/components/chat-message-actions";
import { useSettings } from "@/lib/hooks/use-settings";

export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  const { settings } = useSettings();

  const hasMP4File = (content: string) =>
    content.trim().toLowerCase().includes(".mp4");

  return (
    <div
      className={cn("group relative mb-4 flex items-start  w-full")}
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
        ) : settings.useOllama ? (
          <>🦙</>
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
            a({ node, href, children, ...props }) {
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

              if (!match) {
                if (hasMP4File(content)) {
                  return <VideoComponent filePath={content.trim()} />;
                }
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

function VideoComponent({ filePath }: { filePath: string }) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideo() {
      try {
        const videoData = await readFile(filePath);
        const blob = new Blob([videoData], { type: "video/mp4" });
        setVideoSrc(URL.createObjectURL(blob));
      } catch (error) {
        console.error("Failed to load video:", error);
      }
    }

    loadVideo();

    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [filePath]);

  if (!videoSrc) {
    return (
      <div className="w-full h-48 bg-gray-200 animate-pulse rounded-md flex items-center justify-center">
        <span className="text-gray-500">Loading video...</span>
      </div>
    );
  }

  return (
    <video controls className="w-full max-w-2xl">
      <source src={videoSrc} type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  );
}
