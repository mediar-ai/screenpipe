import React, { useEffect, useState, useRef } from "react";
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
import { listen } from "@tauri-apps/api/event";
import { MemoizedReactMarkdown } from "./markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import localforage from "localforage";
import { format } from "date-fns";

export interface Message {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

interface InboxMessagesProps {
  messages: Message[];
  onMessageRead: (id: string) => void;
  onMessageDelete: (id: string) => void;
  onClose: () => void;
}

export function InboxMessages({
  messages: initialMessages,
  onMessageRead,
  onMessageDelete,
  onClose,
}: InboxMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );
  const [dialogMessage, setDialogMessage] = useState<Message | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadMessages = async () => {
      const savedMessages = await localforage.getItem<Message[]>(
        "inboxMessages"
      );
      if (savedMessages) {
        setMessages(savedMessages);
      } else {
        setMessages(initialMessages);
      }
    };

    loadMessages();

    const unlisten = listen<Message>(
      "inbox-message-received",
      async (event) => {
        console.log("inbox-message-received", event);
        const newMessage: Message = {
          id: Date.now().toString(),
          title: event.payload.title,
          body: event.payload.body,
          date: new Date().toISOString(),
          read: false,
        };
        const updatedMessages = [newMessage, ...messages];
        setMessages(updatedMessages);
        await localforage.setItem("inboxMessages", updatedMessages);
      }
    );

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, [initialMessages, messages]);

  const handleMarkAllAsRead = async () => {
    const updatedMessages = messages.map((msg) => ({ ...msg, read: true }));
    setMessages([]); // Clear all messages from the display
    await localforage.setItem("inboxMessages", updatedMessages);
    updatedMessages.forEach((msg) => {
      onMessageRead(msg.id);
      onMessageDelete(msg.id); // Add this to remove messages from parent state
    });
  };

  const handleMessageAction = async (id: string) => {
    const updatedMessages = messages.filter((msg) => msg.id !== id);
    setMessages(updatedMessages);
    await localforage.setItem("inboxMessages", updatedMessages);
    onMessageRead(id);
    onMessageDelete(id);
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

  const handleMessageRead = async (id: string) => {
    const updatedMessages = messages.map((msg) =>
      msg.id === id ? { ...msg, read: true } : msg
    );
    setMessages(updatedMessages);
    await localforage.setItem("inboxMessages", updatedMessages);
    onMessageRead(id);
  };

  const openDialog = (message: Message) => {
    setDialogMessage(message);
    setDialogOpen(true);
    if (!message.read) {
      handleMessageRead(message.id);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const handleDeleteAndClose = async () => {
    if (dialogMessage) {
      await handleMessageAction(dialogMessage.id);
      closeDialog();
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        inboxRef.current &&
        !inboxRef.current.contains(event.target as Node)
      ) {
        if (!dialogOpen) {
          onClose(); // Close the entire inbox component
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
                          className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[35vw]  text-sm"
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMessageAction(message.id)}
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
