import React from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { MemoizedReactMarkdown } from "@/components/markdown";

interface MarkdownWithExternalLinksProps {
  children: React.ReactNode;
  className?: string;
}

export const MarkdownWithExternalLinks: React.FC<
  MarkdownWithExternalLinksProps
> = ({ children, className }) => {
  return (
    <MemoizedReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, remarkMath]}
      components={{
        a: ({ node, href, children, ...props }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        ),
      }}
    >
      {children!.toString()}
    </MemoizedReactMarkdown>
  );
};
