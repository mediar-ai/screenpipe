import React, { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  X,
  ChevronDown,
  ChevronUp,
  Bot,
  Maximize2,
  CheckSquare,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { MemoizedReactMarkdown } from "./markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { format } from "date-fns";
import posthog from "posthog-js";

export interface InboxMessageAction {
  label: string;
  action: string;
  port: number;
}

export interface Message {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  actions?: InboxMessageAction[];
}

interface InboxMessagesProps {
  messages: Message[];
  onMessageRead: (id: string) => void;
  onMessageDelete: (id: string) => void;
  onClose: () => void;
}

export function InboxMessages({
  messages,
  onMessageRead,
  onMessageDelete,
  onClose,
}: InboxMessagesProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );
  const [dialogMessage, setDialogMessage] = useState<Message | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);

  console.log("messages", messages);

  const handleMarkAllAsRead = () => {
    messages.forEach((msg) => {
      if (!msg.read) {
        onMessageRead(msg.id);
      }
    });
  };

  const toggleMessageExpansion = (id: string) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const truncateContent = (content: string | undefined, maxLength: number) => {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  const openDialog = (message: Message) => {
    setDialogMessage(message);
    setDialogOpen(true);
    if (!message.read) {
      onMessageRead(message.id);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const handleDeleteAndClose = () => {
    if (dialogMessage) {
      onMessageDelete(dialogMessage.id);
      closeDialog();
    }
  };

  const handleAction = async (actionId: string, port: number) => {
    try {
      const response = await fetch(`http://localhost:${port}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("failed to send action callback:", error);
    }
  };

  useEffect(() => {
    // Trigger PostHog event when the inbox is opened
    posthog.capture("inbox opened");

    function handleClickOutside(event: MouseEvent) {
      if (
        inboxRef.current &&
        !inboxRef.current.contains(event.target as Node)
      ) {
        if (!dialogOpen) {
          onClose();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dialogOpen, onClose]);

  return (
    <div ref={inboxRef}>
      <ScrollArea className="w-full max-w-[46vw] overflow-y-auto max-h-[80vh]">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="text-lg font-semibold">inbox messages</h2>
            {messages.filter((msg) => !msg.read).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs"
              >
                <CheckSquare className="mr-1 h-4 w-4" />
                mark all as read
              </Button>
            )}
          </CardHeader>
          <CardContent className="min-h-[200px] w-[45vw]">
            {messages.filter((msg) => !msg.read).length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                no new messages
              </div>
            ) : (
              messages
                .filter((msg) => !msg.read)
                .map((message) => (
                  <Card
                    key={message.id}
                    className={`mb-4 w-full ${
                      message.read ? "bg-secondary/50" : "bg-background"
                    }`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between py-2">
                      <div className="flex items-center space-x-2 flex-1 mr-2 max-w-[70%]">
                        <Bot className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <h3
                          className="text-sm font-semibold truncate"
                          title={message.title}
                        >
                          {message.title}
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(message.date)}
                      </span>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="w-full overflow-hidden">
                        <MemoizedReactMarkdown
                          className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[35vw] text-sm"
                          remarkPlugins={[remarkGfm, remarkMath]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">{children}</p>
                            ),
                            a: ({ node, href, children, ...props }) => {
                              const isExternal =
                                href?.startsWith("http") ||
                                href?.startsWith("https");
                              return (
                                <a
                                  href={href}
                                  target={isExternal ? "_blank" : undefined}
                                  rel={
                                    isExternal
                                      ? "noopener noreferrer"
                                      : undefined
                                  }
                                  className="break-all text-blue-500 hover:underline"
                                  {...props}
                                >
                                  {children}
                                </a>
                              );
                            },
                          }}
                        >
                          {expandedMessages.has(message.id)
                            ? message.body || ""
                            : truncateContent(message.body, 150)}
                        </MemoizedReactMarkdown>
                      </div>
                      {message.body && message.body.length > 150 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMessageExpansion(message.id)}
                          className="text-xs mt-2"
                        >
                          {expandedMessages.has(message.id) ? (
                            <>
                              <ChevronUp className="mr-1 h-4 w-4" />
                              show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="mr-1 h-4 w-4" />
                              show more
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-end space-x-2 py-2">
                      {message.actions?.map((action) => (
                        <Button
                          key={`${message.id}-${action.action}`}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleAction(action.action, action.port);
                          }}
                          className="text-xs"
                        >
                          {action.label}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMessageDelete(message.id)}
                        className="text-xs"
                      >
                        <X className="mr-1 h-4 w-4" />
                        dismiss
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(message)}
                        className="text-xs"
                      >
                        <Maximize2 className="mr-1 h-4 w-4" />
                        expand
                      </Button>
                    </CardFooter>
                  </Card>
                ))
            )}
          </CardContent>
        </Card>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
        >
          <DialogContent
            className="max-w-3xl max-h-[80vh] overflow-y-auto"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{dialogMessage?.title}</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <MemoizedReactMarkdown
                className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
                remarkPlugins={[remarkGfm, remarkMath]}
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  a: ({ node, href, children, ...props }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {dialogMessage?.body || ""}
              </MemoizedReactMarkdown>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              {dialogMessage?.actions?.map((action) => (
                <Button
                  key={`dialog-${dialogMessage.id}-${action.action}`}
                  variant="outline"
                  onClick={() => {
                    console.log(`Dialog action clicked: ${action.label}`);
                  }}
                >
                  {action.label}
                </Button>
              ))}
              <DialogClose asChild>
                <Button variant="outline" onClick={closeDialog}>
                  close
                </Button>
              </DialogClose>
              <Button variant="default" onClick={handleDeleteAndClose}>
                dismiss
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </ScrollArea>
    </div>
  );
}
