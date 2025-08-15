import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { MemoizedReactMarkdown } from "./markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./ui/codeblock";

export const ChangelogDialog: React.FC = () => {
  const [changelogContent, setChangelogContent] = useState<string>("");
  const { showChangelogDialog, setShowChangelogDialog } = useChangelogDialog();

  useEffect(() => {
    const fetchChangelog = async () => {
      const response = await fetch("/CHANGELOG.md");
      const text = await response.text();
      setChangelogContent(text);
    };

    fetchChangelog();
  }, []);

  const onClose = () => setShowChangelogDialog(false);

  return (
    <Dialog open={showChangelogDialog} onOpenChange={onClose}>
      <DialogContent className="w-11/12 max-w-6xl p-6 h-[80vh] overflow-auto">
        <div className="max-w-max prose prose-medium prose-slate w-full h-full">
          <h1>Changelog</h1>
          <MemoizedReactMarkdown
            // className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
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
            {changelogContent}
          </MemoizedReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
};
