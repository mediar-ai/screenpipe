"use client";

import * as React from "react";
import { useState } from "react";
import { Search, Database } from "lucide-react";
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

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedSql, setGeneratedSql] = useState("");
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
          content: `You are an SQL expert. Generate SQLite queries based on natural language input.
          Important rules:
          - Only return the SQL query, no explanations
          - Use proper SQLite syntax
          - Use FTS tables when searching text: ocr_text_fts, audio_transcriptions_fts, ui_monitoring_fts
          - Common joins:
            - frames + ocr_text for screen content
            - audio_chunks + audio_transcriptions for voice
            - ui_monitoring for UI interactions
          - Always include proper timestamp filtering
          - Use proper escaping for text searches
          - Keep queries efficient by using indexes
          - Return results ordered by timestamp DESC
          Schema highlights:
          - Screen content: frames, ocr_text, ocr_text_fts
          - Audio: audio_chunks, audio_transcriptions, audio_transcriptions_fts 
          - UI: ui_monitoring, ui_monitoring_fts
          - All tables have timestamp columns
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
        temperature: 0.3, // Lower temperature for more precise SQL
      });

      const sql = completion.choices[0].message.content!;
      setGeneratedSql(sql);
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `query failed: ${response.statusText}`
        );
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
            <div className="flex justify-between items-center">
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
              {isLoading ? "executing..." : "execute sql"}
            </Button>

            {results.length === 0 && !error && !isLoading && sqlQuery && (
              <div className="text-center py-8 text-muted-foreground">
                no results found for this query
              </div>
            )}

            {results.length > 0 && (
              <div className="rounded-md border mt-4 max-h-[400px] overflow-auto">
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
            )}
          </div>
        </div>
      </CommandDialog>
    </>
  );
}
