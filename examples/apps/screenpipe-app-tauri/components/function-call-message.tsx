import React, { useState } from "react";
import { Message } from "ai";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCode, IconOpenAI } from "@/components/ui/icons";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { useSettings } from "@/lib/hooks/use-settings";

interface FunctionCallMessageProps {
  message: Message;
  isResult?: boolean;
}

export function FunctionCallMessage({
  message,
}: FunctionCallMessageProps) {
  const { settings } = useSettings();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  console.log("FunctionCallMessage", message);


  // @ts-ignore TODO
  const toolCalls = message.content.filter((content) => !content.result);
  // @ts-ignore TODO
  const toolResults = message.content.filter((content) => content.result);
  const isResult = toolResults && toolResults.length > 0;

  console.log("toolCalls", toolCalls);
  console.log("toolResults", toolResults);
  // message.content.find((content) => content.args.queries
  return (
    <div className="group relative mb-4 flex items-start md:-ml-12">
      <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-primary text-primary-foreground">
        {settings.useOllama ? <>🦙</> : <IconOpenAI />}
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden">
        <Card className="w-[600px]">
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
                    <AccordionTrigger className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Badge variant="secondary" className="mr-2">
                          {toolCall.type}
                        </Badge>
                      </div>
                      <span className="flex-grow text-center">
                        {toolCall.toolName}
                      </span>
                      <Dialog
                        open={isDialogOpen}
                        onOpenChange={setIsDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="mr-2">
                            <IconCode />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>View code</DialogTitle>
                            <DialogDescription>
                              You can use the following code to start
                              integrating your current prompt and settings into
                              your application.
                            </DialogDescription>
                          </DialogHeader>
                          <CodeBlock
                            language="bash"
                            value={generateCurlCommand(
                              toolCall.args.queries[0]
                            )}
                          />
                        </DialogContent>
                      </Dialog>
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
                    <AccordionTrigger className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Badge variant="secondary" className="mr-2">
                          {toolResult.type}
                        </Badge>
                      </div>
                      <span className="flex-grow text-center">
                        {toolResult.toolName}
                      </span>
                      <Dialog
                        open={isDialogOpen}
                        onOpenChange={setIsDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="mr-2">
                            <IconCode />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>View code</DialogTitle>
                            <DialogDescription>
                              You can use the following code to start
                              integrating your current prompt and settings into
                              your application.
                            </DialogDescription>
                          </DialogHeader>
                          <CodeBlock
                            language="bash"
                            value={generateCurlCommand(
                              toolResult.args.queries[0]
                            )}
                          />
                        </DialogContent>
                      </Dialog>
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
        code({ node, className, children, ...props }) {
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

// Add this function at the end of the file
function generateCurlCommand(query: any): string {
  const baseUrl = "http://localhost:3030";
  const queryParams = new URLSearchParams({
    content_type: query.contentType || "all",
    limit: query.limit?.toString() || "10",
    offset: query.offset?.toString() || "0",
    start_time: query.start_time || "",
    end_time: query.end_time || "",
  });

  if (query.q) queryParams.append("q", query.q);
  if (query.app_name) queryParams.append("app_name", query.app_name);

  return `curl "${baseUrl}/search?\\
${queryParams.toString().replace(/&/g, "\\\n&")}"`;
}
