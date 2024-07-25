import React from "react";
import { Message } from "ai";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconOpenAI } from "@/components/ui/icons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MemoizedReactMarkdown } from "./markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./ui/codeblock";

interface FunctionCallMessageProps {
  message: Message;
  isResult?: boolean;
}

export function FunctionCallMessage({
  message,
  isResult = false,
}: FunctionCallMessageProps) {
  console.log("FunctionCallMessage", message);
  // @ts-ignore TODO
  const toolCalls = message.content.filter((content) => !content.result);
  // @ts-ignore TODO
  const toolResults = message.content.filter((content) => content.result);

  console.log("toolCalls", toolCalls);
  console.log("toolResults", toolResults);
  return (
    <div className="group relative mb-4 flex items-start md:-ml-12">
      <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-primary text-primary-foreground">
        <IconOpenAI />
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {isResult ? "Function Result" : "Function Call"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isResult && (
              <Accordion type="single" collapsible className="w-full">
                {toolCalls.map((toolCall: any, index: number) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger>
                      <Badge variant="secondary" className="mr-2">
                        {toolCall.type}
                      </Badge>
                      {toolCall.toolName}
                    </AccordionTrigger>
                    <AccordionContent>
                      <MarkdownContent
                        content={`\`\`\`json\n${JSON.stringify(
                          toolCall,
                          null,
                          2
                        )}\n\`\`\``}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            {isResult && (
              <Accordion type="single" collapsible className="w-full">
                {toolResults.map((toolResult: any, index: number) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger>
                      <Badge variant="secondary" className="mr-2">
                        {toolResult.type}
                      </Badge>
                      {toolResult.toolName}
                    </AccordionTrigger>
                    <AccordionContent>
                      <MarkdownContent
                        content={`\`\`\`json\n${JSON.stringify(
                          toolResult,
                          null,
                          2
                        )}\n\`\`\``}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <MemoizedReactMarkdown
      className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
      remarkPlugins={[remarkGfm, remarkMath]}
      components={{
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        code({ node, inline, className, children, ...props }) {
          let childrenContent = Array.isArray(children)
            ? children[0]
            : children;

          if (typeof childrenContent === "string") {
            if (childrenContent === "▍") {
              return (
                <span className="mt-1 cursor-default animate-pulse">▍</span>
              );
            }

            childrenContent = childrenContent.replace("`▍`", "▍");
          }

          const match = /language-(\w+)/.exec(className || "");

          if (inline) {
            return (
              <code className={className} {...props}>
                {childrenContent}
              </code>
            );
          }

          return (
            <CodeBlock
              key={Math.random()}
              language={(match && match[1]) || ""}
              value={String(childrenContent).replace(/\n$/, "")}
              {...props}
            />
          );
        },
      }}
    >
      {content}
    </MemoizedReactMarkdown>
  );
}
