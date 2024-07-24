// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx

// import { Message } from 'ai'
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/codeblock";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { IconLlama, IconOpenAI, IconUser } from "@/components/ui/icons";
import { ChatMessageActions } from "@/components/chat-message-actions";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ChatMessageProps {
  message: any;
}

function FunctionCall({
  functionCall,
  result,
}: {
  functionCall: any;
  result: any;
}) {
  return (
    <div className="bg-muted rounded-md p-2 mt-2 text-sm">
      <Badge variant="secondary" className="mb-2">
        Function Call
      </Badge>
      <p className="font-semibold">{functionCall.name}</p>
      <pre className="text-xs overflow-x-auto">
        {JSON.stringify(JSON.parse(functionCall.arguments), null, 2)}
      </pre>
      {result && <QueryResult result={result} />}
    </div>
  );
}

function QueryResult({ result }: { result: any }) {
  return (
    <Card className="w-full mt-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Query Result</CardTitle>
      </CardHeader>
      <CardContent>
        {result.data.length > 0 ? (
          <ul className="space-y-2">
            {result.data.map((item: any, index: number) => (
              <li key={index} className="text-sm">
                <strong>{item.title}</strong>
                <p className="text-muted-foreground">{item.snippet}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No results found.</p>
        )}
        <div className="mt-2 text-xs text-muted-foreground">
          Total: {result.pagination.total}, Limit: {result.pagination.limit},
          Offset: {result.pagination.offset}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  const isFunctionCall = message.role === "assistant" && message.function_call;
  const functionCallResult =
    message.role === "function" ? message.content : undefined;

  console.log(message);
  return (
    <div
      className={cn("group relative mb-4 flex items-start md:-ml-12")}
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
        {message.role === "user" ? <IconUser /> : <IconLlama />}
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden">
        {isFunctionCall ? (
          <FunctionCall
            functionCall={message.function_call}
            result={functionCallResult}
          />
        ) : (
          <MemoizedReactMarkdown
            className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
            remarkPlugins={[remarkGfm, remarkMath]}
            components={{
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
              },
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const language = match && match[1] ? match[1] : "";

                if (inline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }

                const [fileName, ...codeParts] = children[0].split("\n");
                const codeContent = codeParts.join("\n");

                return (
                  <div className="relative">
                    {fileName && (
                      <div className="absolute top-0 right-0 bg-gray-700 text-white text-xs px-2 py-1 rounded-bl">
                        {fileName.trim()}
                      </div>
                    )}
                    <SyntaxHighlighter
                      language={language}
                      style={oneDark}
                      customStyle={{ marginTop: fileName ? "2rem" : "0" }}
                      {...props}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {message.content}
          </MemoizedReactMarkdown>
        )}
        <ChatMessageActions message={message} />
      </div>
    </div>
  );
}
