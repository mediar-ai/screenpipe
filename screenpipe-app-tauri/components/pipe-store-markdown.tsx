import { MemoizedReactMarkdown } from "@/components/markdown";
import { CodeBlock } from "@/components/ui/codeblock";
import { useState } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { convertHtmlToMarkdown } from "@/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
  variant?: "default" | "compact";
}

export function PipeStoreMarkdown({
  content,
  className,
  variant = "default",
}: MarkdownProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const processedContent = convertHtmlToMarkdown(content);

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <MemoizedReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          code({ node, className, children, ...props }) {
            const content = String(children).replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className || "");

            return match ? (
              <div className="relative group">
                <CodeBlock
                  key={Math.random()}
                  language={(match && match[1]) || ""}
                  value={content}
                  {...props}
                />
              </div>
            ) : (
              <span className="relative group inline-block">
                <code
                  className="py-0.5 px-1 rounded-sm font-mono text-sm  text-grey-900"
                  {...props}
                >
                  {content}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute -right-3 -top-3 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                  onClick={() => copyToClipboard(content)}
                >
                  {isCopied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </span>
            );
          },
          a({ href, children }) {
            const isDirectVideo =
              href?.match(/\.(mp4|webm|ogg)$/) ||
              href?.includes("user-attachments/assets");
            const youtubeMatch = href?.match(
              /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/
            );

            if (isDirectVideo) {
              return (
                <RetryableVideo src={href} maxRetries={3} retryDelay={1000} />
              );
            } else if (youtubeMatch) {
              return (
                <iframe
                  width="100%"
                  height="315"
                  src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="max-w-full"
                  style={{ maxHeight: "400px" }}
                />
              );
            }

            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          img({ node, ...props }) {
            return (
              <img
                {...props}
                className="max-w-full h-auto rounded-lg"
                style={{ maxHeight: "600px" }}
              />
            );
          },
        }}
      >
        {processedContent.replace(/Â/g, "")}
      </MemoizedReactMarkdown>
    </div>
  );
}

const RetryableVideo = ({
  src,
  maxRetries = 3,
  retryDelay = 1000,
}: {
  src?: string;
  maxRetries?: number;
  retryDelay?: number;
}) => {
  const [retries, setRetries] = useState(0);
  const [key, setKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = (e: any) => {
    console.error("video loading error:", e);
    if (retries < maxRetries) {
      setTimeout(() => {
        setRetries(retries + 1);
        setKey(key + 1);
      }, retryDelay);
    }
  };

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 animate-pulse bg-zinc-800 rounded-md" />
      )}
      <video
        key={key}
        src={src}
        controls
        className="max-w-full h-auto"
        style={{ maxHeight: "400px" }}
        onError={handleError}
        onLoadStart={() => {
          console.log("video load started:", src);
          setIsLoading(true);
        }}
        onLoadedData={() => {
          console.log("video data loaded:", src);
          setIsLoading(false);
        }}
      >
        your browser does not support the video tag.
      </video>
    </div>
  );
};
