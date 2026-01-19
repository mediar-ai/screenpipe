"use client";

import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { FC, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Copy,
  Check,
  RefreshCw,
  ArrowDown,
  Send,
  Square,
} from "lucide-react";
import { CodeBlock } from "@/components/ui/codeblock";
import { VideoComponent } from "@/components/video";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Thread Root
export const Thread: FC<{ children?: ReactNode }> = ({ children }) => {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full w-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessage,
            AssistantMessage: AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      {children}
    </ThreadPrimitive.Root>
  );
};

// User Message
const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group relative mb-4 flex items-start w-full">
      <Avatar className="flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-background">
        <AvatarFallback className="text-sm">U</AvatarFallback>
      </Avatar>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden">
        <MessagePrimitive.Content
          components={{
            Text: UserTextMessage,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
};

// Simple text rendering for user messages
const UserTextMessage: FC = () => {
  return (
    <p className="mb-2 last:mb-0 prose dark:prose-invert">
      <MessagePrimitive.If user>
        <MarkdownTextPrimitive />
      </MessagePrimitive.If>
    </p>
  );
};

// Assistant Message
const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group relative mb-4 flex items-start w-full">
      <Avatar className="flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-primary text-primary-foreground">
        <AvatarFallback className="text-sm">AI</AvatarFallback>
      </Avatar>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden w-[96em]">
        <MessagePrimitive.Content
          components={{
            Text: AssistantTextMessage,
          }}
        />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

// Markdown rendering for assistant messages
const AssistantTextMessage: FC = () => {
  const hasMP4File = (content: string) =>
    content.trim().toLowerCase().includes(".mp4");

  return (
    <MarkdownTextPrimitive
      className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
      remarkPlugins={[remarkGfm, remarkMath]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ href, children, ...props }) => {
          const isMP4Link = href?.toLowerCase().includes(".mp4");
          if (isMP4Link && href) {
            return <VideoComponent filePath={href} />;
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        },
        code: ({ className, children, ...props }) => {
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
            />
          );
        },
      }}
    />
  );
};

// Action Bar
const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex items-center gap-1 mt-2"
    >
      <ActionBarPrimitive.Copy asChild>
        <IconButton tooltip="Copy">
          <Copy className="h-4 w-4" />
        </IconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <IconButton tooltip="Regenerate">
          <RefreshCw className="h-4 w-4" />
        </IconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

// Composer
export const Composer: FC<{
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
}> = ({ disabled, placeholder = "Ask a question about the results...", isStreaming, onStop }) => {
  return (
    <ComposerPrimitive.Root className="flex items-center gap-2">
      <ComposerPrimitive.Input
        autoFocus
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 h-12 px-4 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      {isStreaming ? (
        <Button
          type="button"
          onClick={onStop}
          className="h-12 w-12"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <ComposerPrimitive.Send asChild disabled={disabled}>
          <Button className="h-12 w-12" disabled={disabled}>
            <Send className="h-4 w-4" />
          </Button>
        </ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  );
};

// Scroll to Bottom Button
export const ScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-4 right-4 rounded-full"
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
};

// Helper Icon Button
const IconButton = forwardRef<
  HTMLButtonElement,
  { tooltip: string; children: ReactNode; className?: string }
>(({ tooltip, children, className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      title={tooltip}
      {...props}
    >
      {children}
    </Button>
  );
});
IconButton.displayName = "IconButton";
