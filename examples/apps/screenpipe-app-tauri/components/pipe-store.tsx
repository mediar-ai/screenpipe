import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { usePipes, Pipe } from "@/lib/hooks/use-pipes";
import { CodeBlock } from "@/components/ui/codeblock";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Skeleton } from "./ui/skeleton";
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
const PipeDialog: React.FC = () => {
  const { pipes, loading, error } = usePipes(
    "https://github.com/different-ai/file-organizer-2000"
  );
  const [selectedPipe, setSelectedPipe] = useState<Pipe | null>(null);

  const formatUpdatedTime = (date: string) => {
    const now = new Date();
    const updated = new Date(date);
    const diffTime = Math.abs(now.getTime() - updated.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">Pipe Store</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader>
          <DialogTitle>Pipes</DialogTitle>
        </DialogHeader>
        <div className="flex h-[600px]">
          <div className="w-1/3 pr-4 overflow-y-auto">
            {loading &&
              Array(5)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="mb-2">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ))}
            {error && <p>Error: {error}</p>}
            {pipes.map((pipe: any) => (
              <Card
                key={pipe.name}
                className="cursor-pointer hover:bg-gray-100 mb-2 p-2"
                onClick={() => setSelectedPipe(pipe)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold">{pipe.name}</h3>
                    <p className="text-xs text-gray-500">by {pipe.author}</p>
                  </div>
                  <div className="text-xs text-gray-500 flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    {pipe.downloads}
                  </div>
                </div>
                <p className="text-xs mt-1 line-clamp-2">{pipe.description}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Updated {formatUpdatedTime(pipe.lastUpdate)}
                </p>
              </Card>
            ))}
          </div>
          <div className="w-1/2 pl-4 border-l overflow-y-auto">
            {selectedPipe && (
              <>
                <h2 className="text-2xl font-bold mb-2">{selectedPipe.name}</h2>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p>Downloads: {selectedPipe.downloads}</p>
                    <p>Version: {selectedPipe.version}</p>
                    <p>
                      By:{" "}
                      <a
                        href={selectedPipe.authorLink}
                        className="text-blue-500 hover:underline"
                      >
                        {selectedPipe.author}
                      </a>
                    </p>
                    <p>
                      Repository:{" "}
                      <a
                        href={selectedPipe.repository}
                        className="text-blue-500 hover:underline"
                      >
                        Link
                      </a>
                    </p>
                    <p>
                      Last update:{" "}
                      <a
                        href={selectedPipe.repository}
                        className="text-blue-500 hover:underline"
                      >
                        {formatDate(selectedPipe.lastUpdate)}
                      </a>
                    </p>
                  </div>
                </div>
                <p className="mb-4">{selectedPipe.description}</p>
                <div className="flex space-x-2 mb-4">
                  <Button disabled variant="outline">
                    Install
                    <Badge variant="secondary" className="ml-2">
                      Soon
                    </Badge>
                  </Button>
                  <Button disabled variant="outline">
                    Copy Share Link
                    <Badge variant="secondary" className="ml-2">
                      Soon
                    </Badge>
                  </Button>
                  <Button disabled variant="outline">
                    Donate
                    <Badge variant="secondary" className="ml-2">
                      Soon
                    </Badge>
                  </Button>
                </div>
                <Separator className="my-4" />
                <div className="mt-4">
                  <h3 className="text-xl font-semibold mb-2">
                    About this Pipe
                  </h3>
                  <MemoizedReactMarkdown
                    className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full"
                    remarkPlugins={[remarkGfm, remarkMath]}
                    components={{
                      p({ children }) {
                        console.log("YOOOO SOME PP", children);

                        return <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      code({ node, className, children, ...props }) {
                        const content = String(children).replace(/\n$/, "");
                        const match = /language-(\w+)/.exec(className || "");

                        if (!match) {
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
                      img({ src, alt }) {
                        console.log("YOOOO", src);
                        return (
                          <img
                            src={src}
                            alt={alt}
                            className="max-w-full h-auto"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = "path/to/fallback/image.png"; // Replace with your fallback image
                            }}
                          />
                        );
                      },
                    }}
                  >
                    {selectedPipe.fullDescription.replace(/Â/g, "")}
                  </MemoizedReactMarkdown>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PipeDialog;
