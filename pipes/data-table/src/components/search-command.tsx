"use client";

import * as React from "react";
import { useState } from "react";
import { Search, Database, Bot, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import OpenAI from "openai";
import { toast } from "@/components/ui/use-toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { DialogTitle } from "./ui/dialog";
import { SheetTitle } from "./ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useSettings();
  const [results, setResults] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);

  // Add useEffect for OS detection
  React.useEffect(() => {
    setIsMac(navigator.userAgent.includes("Mac"));
  }, []);

  // Add useEffect for keyboard shortcut
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleGenerateSql = async () => {
    if (!query.trim()) return;

    setIsLoading(true);

    try {
      const openai = new OpenAI({
        apiKey:
          settings.aiProviderType === "screenpipe-cloud"
            ? settings.user.token
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are an SQL expert helping developers query Screenpipe's 24/7 recording context database. Generate SQLite queries based on natural language input.

          Important rules:
          - Only return the SQL query, no explanations
          - Use proper SQLite syntax
          - Use FTS tables for text search: ocr_text_fts (screen text), audio_transcriptions_fts (voice), ui_monitoring_fts (UI), frames_fts (file names)
          - Keep queries efficient by using indexes
          - Return results ordered by timestamp DESC
          - Limit results to 100 rows by default
          - Use JOIN operations to correlate data across different sources
          - Do not add \`\`\`sql to the beginning or end of the query, we'll execute your query directly

          Core Tables:

          1. Screen Recording:
            - frames: captures of screen content
              (id, video_chunk_id, offset_index, timestamp, name)
            - ocr_text: text extracted from screens
              (frame_id, text, text_json, app_name, window_name, focused)
            - ocr_text_fts: optimized text search
              (text, app_name, window_name, frame_id)
            - ocr_text_embeddings: vector embeddings
              (id, frame_id, embedding, created_at)
          
          2. Audio Recording:
            - audio_chunks: recorded audio segments
              (id, file_path, timestamp)
            - audio_transcriptions: speech-to-text
              (id, audio_chunk_id, offset_index, timestamp, transcription, device, is_input_device, speaker_id, start_time, end_time)
            - audio_transcriptions_fts: optimized voice search
              (transcription, device, audio_chunk_id, speaker_id, start_time, end_time)
            - speakers: voice identification
              (id, name, metadata, hallucination)
          
          3. UI Monitoring:
            - ui_monitoring: app/window state
              (id, text_output, timestamp, app, window, initial_traversal_at)
            - ui_monitoring_fts: optimized UI search
              (text_output, app, window, ui_id)
          
          4. Tagging System:
            - tags: user-defined categories
              (id, name, created_at)
            - vision_tags: tags for screen content
              (vision_id, tag_id)
            - audio_tags: tags for audio content
              (audio_chunk_id, tag_id)
            - ui_monitoring_tags: tags for UI events
              (ui_monitoring_id, tag_id)

          Optimized Join Patterns:
          - Screen content: JOIN frames f ON ocr_text.frame_id = f.id
          - Voice transcriptions: JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
          - UI events: JOIN ui_monitoring_fts umf ON um.id = umf.ui_id
          - Tagged content: JOIN tags t ON vt.tag_id = t.id
          
          Performance Indexes:
          - frames: timestamp, video_chunk_id
          - ocr_text: frame_id, app_name, window_name
          - audio_transcriptions: audio_chunk_id, timestamp
          - ui_monitoring: timestamp, app, window

          Common Query Patterns:
          - Time-based filtering: WHERE timestamp BETWEEN x AND y
          - Cross-source correlation: JOIN multiple recording types
          - Full-text search: Using _fts tables with MATCH
          - App/window context: Filtering by app_name/window_name
          - Tagged content: JOIN with tags tables
          - Join audio transcriptions with speakers to get the speaker name
          `,
        },
        {
          role: "user",
          content: query,
        },
      ];

      const completion = await openai.chat.completions.create({
        model: settings.aiModel,
        messages,
        temperature: 0.3,
      });

      let sql = completion.choices[0].message.content!;
      // Remove SQL code fence markers if present
      sql = sql.trim().replace(/```sql\n?|\n?```/g, "").trim();
      setSqlQuery(sql);

      // Here you would execute the SQL query
      // const results = await pipe.executeSql(sql);
    } catch (error: any) {
      console.error("Error generating SQL:", error);
      toast({
        title: "error",
        description: "failed to generate sql query. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsLoading(true);
    setError(null); // Reset error state
    setResults([]); // Clear previous results

    try {
      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sqlQuery,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("error executing query:", errorData);
        throw new Error(errorData || `query failed: ${errorData}`);
      }

      const data = await response.json();
      setResults(data);
      if (data.length > 0) {
        setColumns(Object.keys(data[0]));
      } else {
        setColumns([]);
      }
    } catch (error: any) {
      console.error("error executing query:", error);
      setError(error.message || "failed to execute query");
    } finally {
      setIsLoading(false);
    }
  };

  const copyTableToClipboard = () => {
    if (results.length === 0) return;

    // Create markdown table
    const headers = `| ${columns.join(" | ")} |`;
    const separator = `| ${columns.map(() => "---").join(" | ")} |`;
    const rows = results
      .map(
        (row) =>
          `| ${columns
            .map((col) => row[col]?.toString() || "N/A")
            .join(" | ")} |`
      )
      .join("\n");

    const tableText = `${headers}\n${separator}\n${rows}`;
    navigator.clipboard.writeText(tableText);

    toast({
      description: "copied table as markdown",
    });
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-64 justify-between text-sm text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <span>search with sql...</span>
        </div>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">{isMac ? "⌘" : "ctrl"}</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <SheetTitle></SheetTitle>
        <CommandInput
          placeholder="describe what data you want to query..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleGenerateSql();
            }
          }}
        />
        <div className="px-4 pb-4">
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">using {settings.aiModel}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                onClick={handleGenerateSql}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <span>generating...</span>
                ) : (
                  <span className="flex items-center gap-2">
                    generate sql
                    <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      <span className="text-xs">{isMac ? "⌘" : "ctrl"}</span>
                      enter
                    </kbd>
                  </span>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">sql query</label>
              <Textarea
                placeholder="write or edit sql query..."
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                className={cn(
                  "min-h-[100px] resize-none font-mono",
                  error && "border-red-500"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    executeQuery();
                  }
                }}
              />
              {error && (
                <div className="text-sm text-red-500 font-mono">{error}</div>
              )}
            </div>

            <Button
              className="w-full"
              variant="secondary"
              onClick={executeQuery}
              disabled={isLoading}
            >
              {isLoading ? (
                "executing..."
              ) : (
                <span className="flex items-center gap-2">
                  execute sql
                  <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                    shift + enter
                  </kbd>
                </span>
              )}
            </Button>

            {results.length === 0 && !error && !isLoading && sqlQuery && (
              <div className="text-center py-8 text-muted-foreground">
                no results found for this query
              </div>
            )}

            {results.length > 0 && (
              <div className="rounded-md border mt-4">
                <div className="flex justify-end p-2 border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyTableToClipboard}
                    className="text-xs"
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    copy table
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((column) => (
                          <TableHead key={column}>{column}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row, i) => (
                        <TableRow key={i}>
                          {columns.map((column) => (
                            <TableCell key={column}>
                              <div className="max-w-[300px] truncate">
                                {row[column]?.toString() || "N/A"}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </CommandDialog>
    </>
  );
}
