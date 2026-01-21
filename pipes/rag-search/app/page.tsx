"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string>("");
  const [isIndexing, setIsIndexing] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Chat request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              assistantContent += parsed.content;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return newMessages;
              });
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const runIndexing = async (fullReindex = false) => {
    setIsIndexing(true);
    setIndexStatus(fullReindex ? "Full reindexing (this may take a while)..." : "Indexing...");

    try {
      const url = fullReindex ? "/api/index?full=true" : "/api/index";
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Indexing failed");
      }

      setIndexStatus(
        `Indexed ${data.documentsIndexed} documents. Total: ${data.totalDocuments}`
      );
    } catch (error) {
      setIndexStatus(
        `Error: ${error instanceof Error ? error.message : "Indexing failed"}`
      );
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>RAG Search</h1>
        <div className="header-actions">
          <button
            className="btn"
            onClick={() => runIndexing(false)}
            disabled={isIndexing}
          >
            {isIndexing ? "Indexing..." : "Run Index"}
          </button>
          <button
            className="btn"
            onClick={() => runIndexing(true)}
            disabled={isIndexing}
            title="Re-index all data from the last 30 days"
          >
            Full Reindex
          </button>
          <Link href="/settings" className="btn">
            Settings
          </Link>
        </div>
      </header>

      {indexStatus && (
        <div className={`status ${indexStatus.includes("Error") ? "error" : "success"}`}>
          {indexStatus}
        </div>
      )}

      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Search your screen history</h2>
            <p>Ask questions about what you've seen or heard on your computer.</p>
            <p>
              Make sure to configure your OpenAI API key in{" "}
              <Link href="/settings" className="nav-link">
                Settings
              </Link>{" "}
              and run indexing first.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your screen history..."
          disabled={isLoading}
        />
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
