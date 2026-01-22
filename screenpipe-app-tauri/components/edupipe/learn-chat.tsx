"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { useSettings } from "@/lib/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Send,
  Bot,
  User,
  Lightbulb,
  BookOpen,
  FileQuestion,
  Clock,
  Sparkles,
  Brain,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  GraduationCap,
  Calendar,
  FileText,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  context?: {
    courses?: string[];
    assignments?: string[];
    recentActivity?: string;
  };
}

interface SuggestedQuestion {
  icon: React.ReactNode;
  text: string;
  category: "assignment" | "concept" | "deadline" | "review";
}

export function LearnChat() {
  const { settings: baseSettings } = useSettings();
  const { settings: eduSettings } = useEduPipeSettings();
  const { courses, assignments, upcomingDeadlines, grades } = useCanvas();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Generate contextual suggested questions
  const suggestedQuestions: SuggestedQuestion[] = [
    ...(upcomingDeadlines.length > 0
      ? [
          {
            icon: <Calendar className="h-4 w-4" />,
            text: `Help me plan for my ${upcomingDeadlines[0]?.name} assignment`,
            category: "assignment" as const,
          },
        ]
      : []),
    {
      icon: <FileQuestion className="h-4 w-4" />,
      text: "What did I study yesterday?",
      category: "review" as const,
    },
    {
      icon: <Lightbulb className="h-4 w-4" />,
      text: "Quiz me on recent lecture content",
      category: "concept" as const,
    },
    {
      icon: <Clock className="h-4 w-4" />,
      text: "What are my upcoming deadlines?",
      category: "deadline" as const,
    },
  ];

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Build educational context for AI
  const buildContext = useCallback(() => {
    const contextParts: string[] = [];

    // Add course information
    if (courses.length > 0) {
      const courseList = courses
        .filter((c) => c.isActive)
        .map((c) => `- ${c.name} (${c.code})`)
        .join("\n");
      contextParts.push(`Current Courses:\n${courseList}`);
    }

    // Add upcoming deadlines
    if (upcomingDeadlines.length > 0) {
      const deadlineList = upcomingDeadlines
        .slice(0, 5)
        .map((a) => {
          const course = courses.find((c) => c.id === a.courseId);
          const dueDate = a.dueAt ? format(new Date(a.dueAt), "MMM d, h:mm a") : "No due date";
          return `- ${a.name} (${course?.code || "Unknown"}) - Due: ${dueDate}`;
        })
        .join("\n");
      contextParts.push(`Upcoming Deadlines:\n${deadlineList}`);
    }

    // Add grade overview
    if (grades.length > 0) {
      const gradeList = grades
        .filter((g) => g.currentScore !== undefined)
        .map((g) => `- ${g.courseName}: ${Math.round(g.currentScore!)}%`)
        .join("\n");
      if (gradeList) {
        contextParts.push(`Current Grades:\n${gradeList}`);
      }
    }

    // Add student profile
    contextParts.push(
      `Student Profile: ${eduSettings.profile.persona}${
        eduSettings.profile.major ? `, Major: ${eduSettings.profile.major}` : ""
      }`
    );

    return contextParts.join("\n\n");
  }, [courses, upcomingDeadlines, grades, eduSettings.profile]);

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build the system prompt with educational context
      const educationalContext = buildContext();
      const systemPrompt = `You are EduPipe, an AI-powered educational companion. You help students with their coursework, study planning, and learning.

Current Educational Context:
${educationalContext}

Guidelines:
- Be encouraging and supportive
- Provide clear, educational explanations
- Reference the student's specific courses and assignments when relevant
- Help with study planning and time management
- Offer to quiz the student on concepts
- Suggest resources and study strategies
- If asked about recent activity, you can search the student's screen history
- Keep responses concise but thorough
- Use markdown formatting for clarity

Remember: You have access to the student's Canvas data including courses, assignments, grades, and deadlines.`;

      // Get AI preset from settings
      const aiPreset = baseSettings.aiPresets?.find((p) => p.defaultPreset) || baseSettings.aiPresets?.[0];

      if (!aiPreset) {
        throw new Error("No AI preset configured. Please set up an AI provider in settings.");
      }

      // Prepare messages for API
      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: content.trim() },
      ];

      // Call the AI API
      const response = await fetch(aiPreset.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(aiPreset.provider === "openai" || aiPreset.provider === "custom"
            ? { Authorization: `Bearer ${(aiPreset as { apiKey?: string }).apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: aiPreset.model,
          messages: apiMessages,
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status}`);
      }

      const data = await response.json();
      const assistantContent = data.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response.";

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again or check your AI settings.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          <h2 className="font-semibold">Learn & Chat</h2>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            className="text-xs"
          >
            Clear Chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-md">
              <h3 className="text-xl font-semibold">Welcome to Learn & Chat</h3>
              <p className="text-muted-foreground">
                I'm your AI study companion. Ask me about your courses, assignments, or any topic you're learning about.
              </p>
            </div>

            {/* Suggested Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {suggestedQuestions.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="justify-start gap-2 h-auto py-3 px-4 text-left"
                  onClick={() => sendMessage(q.text)}
                >
                  {q.icon}
                  <span className="text-sm">{q.text}</span>
                </Button>
              ))}
            </div>

            {/* Context Info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {courses.filter((c) => c.isActive).length} courses
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {upcomingDeadlines.length} upcoming
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const inline = !match;
                            return !inline ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                    <span className="text-xs opacity-60">
                      {format(message.timestamp, "h:mm a")}
                    </span>
                    {message.role === "assistant" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(message.content, message.id)}
                            >
                              {copiedId === message.id ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>

                {message.role === "user" && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your courses, assignments, or any topic..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          <Sparkles className="h-3 w-3 inline mr-1" />
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export default LearnChat;
