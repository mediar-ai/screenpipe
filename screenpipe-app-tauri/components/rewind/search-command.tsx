"use client";

import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { useState, useRef, useEffect } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { MultiSelectCombobox } from "./ui/multi-select-combobox";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { Dialog, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { DatePickerWithRange } from "./date-range-picker";
import { queryParser, QueryParser, querySerializer, cn } from "@/lib/utils";
import { CustomDialogContent } from "./custom-dialog-content";
import { ArrowRight, XIcon, Search, Loader2, Send, Square, Bot, User, Sparkles } from "lucide-react";
import { useQueryStates } from "nuqs";
import { CommandShortcut } from "./ui/command";
import { commands } from "@/lib/utils/tauri";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { useMcpClient } from "@/lib/hooks/use-mcp-client";
import { Badge } from "./ui/badge";
import ReactMarkdown from "react-markdown";

const SCREENPIPE_API = "http://localhost:3030";
const VERTEX_PROXY = "https://ai-proxy.i-f9f.workers.dev";

// Tool definitions for Claude - matches screenpipe-mcp search_content tool
const TOOLS = [
	{
		name: "search_content",
		description:
			"Search screenpipe's recorded content: screen text (OCR), audio transcriptions, and UI elements. " +
			"Returns timestamped results with app context. " +
			"Call with no parameters to get recent activity.",
		input_schema: {
			type: "object" as const,
			properties: {
				q: {
					type: "string",
					description: "Search query. Optional - omit to return all recent content.",
				},
				content_type: {
					type: "string",
					enum: ["all", "ocr", "audio", "ui"],
					description: "Content type filter. Default: 'all'",
				},
				limit: {
					type: "integer",
					description: "Max results. Default: 10",
				},
				offset: {
					type: "integer",
					description: "Skip N results for pagination. Default: 0",
				},
				start_time: {
					type: "string",
					description: "ISO 8601 UTC start time (e.g., 2024-01-15T10:00:00Z)",
				},
				end_time: {
					type: "string",
					description: "ISO 8601 UTC end time (e.g., 2024-01-15T18:00:00Z)",
				},
				app_name: {
					type: "string",
					description: "Filter by app (e.g., 'Google Chrome', 'Slack', 'zoom.us')",
				},
				window_name: {
					type: "string",
					description: "Filter by window title",
				},
			},
		},
	},
];

interface SearchResult {
	type: "OCR" | "Audio" | "UI";
	content: {
		text?: string;
		transcription?: string;
		timestamp: string;
		app_name?: string;
		window_name?: string;
		device_name?: string;
	};
}

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function SearchCommand() {
	const [open, setOpen] = React.useState(false);
	const { settings } = useSettings();
	const user = settings.user;
	const { callTool: mcpCallTool, isConnected: mcpConnected } = useMcpClient();

	const [state] = useQueryStates(queryParser);
	const [options, setOptions] = useState<QueryParser>(
		!state
			? {
					query: null,
					start_time: null,
					end_time: null,
					apps: [],
				}
			: state,
	);

	// Search results state
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);

	// AI Chat state
	const [aiInput, setAiInput] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [isAiLoading, setIsAiLoading] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Listen for Rust-level open-search event (Cmd+K / Ctrl+K global shortcut)
	React.useEffect(() => {
		const unlisten = listen("open-search", () => {
			setOpen((open) => !open);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Close dialog when Tauri window loses focus
	React.useEffect(() => {
		const unlisten = listen<boolean>("window-focused", (event) => {
			if (!event.payload && open) {
				setOpen(false);
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [open]);

	// Reset state when dialog closes
	useEffect(() => {
		if (!open) {
			setResults([]);
			setHasSearched(false);
			setMessages([]);
			setAiInput("");
		}
	}, [open]);

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Execute search
	async function handleSearch() {
		if (!options.query?.trim()) return;

		setIsSearching(true);
		setHasSearched(true);
		setResults([]);

		try {
			const params = new URLSearchParams();
			params.append("q", options.query);
			params.append("limit", "10");

			if (options.apps && options.apps.length > 0) {
				params.append("app_name", options.apps[0]);
			}
			if (options.start_time) {
				params.append("start_time", options.start_time.toISOString());
			}
			if (options.end_time) {
				params.append("end_time", options.end_time.toISOString());
			}

			const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`);
			if (!response.ok) throw new Error(`Search failed: ${response.status}`);

			const data = await response.json();
			setResults(data.data || []);
		} catch (error) {
			console.error("Search error:", error);
		} finally {
			setIsSearching(false);
		}
	}

	// Execute search tool via MCP SDK client
	async function executeSearchTool(args: Record<string, unknown>): Promise<string> {
		try {
			// Use MCP SDK client to call search_content tool
			const result = await mcpCallTool("search_content", args);
			return result || "No results found.";
		} catch (error) {
			console.error("MCP search error:", error);
			// Fallback to direct API call if MCP server is not running
			try {
				const params = new URLSearchParams();
				if (args.q) params.append("q", String(args.q));
				if (args.content_type && args.content_type !== "all") {
					params.append("content_type", String(args.content_type));
				}
				if (args.limit) params.append("limit", String(args.limit));
				else params.append("limit", "10");
				if (args.start_time) params.append("start_time", String(args.start_time));
				if (args.end_time) params.append("end_time", String(args.end_time));
				if (args.app_name) params.append("app_name", String(args.app_name));

				const response = await fetch(`${SCREENPIPE_API}/search?${params.toString()}`);
				if (!response.ok) throw new Error(`Search failed: ${response.status}`);

				const data = await response.json();
				const searchResults = data.data || [];

				if (searchResults.length === 0) {
					return "No results found. Try broader search terms or a wider time range.";
				}

				const formatted = searchResults.map((result: SearchResult) => {
					const content = result.content;
					if (!content) return null;

					if (result.type === "OCR") {
						return `[Screen - ${content.app_name || "Unknown"}] ${content.timestamp}\n${content.text || ""}`;
					} else if (result.type === "Audio") {
						return `[Audio - ${content.device_name || "Unknown"}] ${content.timestamp}\n${content.transcription || ""}`;
					} else if (result.type === "UI") {
						return `[UI - ${content.app_name || "Unknown"}] ${content.timestamp}\n${content.text || ""}`;
					}
					return null;
				}).filter(Boolean);

				return `Found ${searchResults.length} results:\n\n${formatted.join("\n\n---\n\n")}`;
			} catch (fallbackError) {
				return `Search failed: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`;
			}
		}
	}

	// Send message to Claude via Vertex proxy
	async function sendAiMessage(userMessage: string) {
		if (!user?.token) {
			setMessages((prev) => [
				...prev,
				{
					id: Date.now().toString(),
					role: "assistant",
					content: "Please sign in to use the AI chat feature.",
				},
			]);
			return;
		}

		const newUserMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: userMessage,
		};
		setMessages((prev) => [...prev, newUserMessage]);
		setAiInput("");
		setIsAiLoading(true);
		setIsStreaming(true);

		abortControllerRef.current = new AbortController();

		try {
			const conversationMessages = [
				...messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
				{ role: "user" as const, content: userMessage },
			];

			let response = await fetch(`${VERTEX_PROXY}/v1/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${user.token}`,
				},
				body: JSON.stringify({
					model: "claude-sonnet-4@20250514",
					max_tokens: 4096,
					system: `You are a helpful AI assistant that can search through the user's Screenpipe data - their screen recordings, audio transcriptions, and UI interactions.

When users ask about what they did, saw, or heard, use the search_screenpipe tool to find relevant information. Be concise in your responses and cite timestamps when relevant.

Current time: ${new Date().toISOString()}`,
					messages: conversationMessages,
					tools: TOOLS,
				}),
				signal: abortControllerRef.current.signal,
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`API error: ${error}`);
			}

			let result = await response.json();

			// Handle tool use loop
			while (result.stop_reason === "tool_use") {
				const toolUseBlocks = result.content.filter(
					(block: any) => block.type === "tool_use"
				);

				const toolResults = [];
				for (const toolUse of toolUseBlocks) {
					if (toolUse.name === "search_screenpipe") {
						const searchResult = await executeSearchTool(toolUse.input);
						toolResults.push({
							type: "tool_result",
							tool_use_id: toolUse.id,
							content: searchResult,
						});
					}
				}

				response = await fetch(`${VERTEX_PROXY}/v1/messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${user.token}`,
					},
					body: JSON.stringify({
						model: "claude-sonnet-4@20250514",
						max_tokens: 4096,
						system: `You are a helpful AI assistant that can search through the user's Screenpipe data. Current time: ${new Date().toISOString()}`,
						messages: [
							...conversationMessages,
							{ role: "assistant", content: result.content },
							{ role: "user", content: toolResults },
						],
						tools: TOOLS,
					}),
					signal: abortControllerRef.current.signal,
				});

				if (!response.ok) {
					const error = await response.text();
					throw new Error(`API error: ${error}`);
				}

				result = await response.json();
			}

			const textContent = result.content
				?.filter((block: any) => block.type === "text")
				.map((block: any) => block.text)
				.join("\n");

			setMessages((prev) => [
				...prev,
				{
					id: Date.now().toString(),
					role: "assistant",
					content: textContent || "I couldn't generate a response.",
				},
			]);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}
			console.error("Chat error:", error);
			setMessages((prev) => [
				...prev,
				{
					id: Date.now().toString(),
					role: "assistant",
					content: `Error: ${error instanceof Error ? error.message : "Something went wrong"}`,
				},
			]);
		} finally {
			setIsAiLoading(false);
			setIsStreaming(false);
			abortControllerRef.current = null;
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSearch();
		}
	};

	const handleAiSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!aiInput.trim() || isAiLoading) return;
		sendAiMessage(aiInput.trim());
	};

	const handleStop = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			setIsAiLoading(false);
			setIsStreaming(false);
		}
	};

	// Format result for display
	const formatResult = (result: SearchResult) => {
		const content = result.content;
		let text = "";
		if (result.type === "OCR" || result.type === "UI") {
			text = content.text || "";
		} else if (result.type === "Audio") {
			text = content.transcription || "";
		}
		// Truncate to 100 chars
		return text.length > 100 ? text.substring(0, 100) + "..." : text;
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTitle className="sr-only">Search Command</DialogTitle>
			<CustomDialogContent
				className={cn(
					"p-0 max-w-screen-sm transition-all duration-200",
					(hasSearched || messages.length > 0) ? "max-h-[80vh]" : ""
				)}
				customClose={
					options.query ? (
						<button onClick={() => commands.openSearchWindow(querySerializer(options))}>
							<ArrowRight className="w-4 h-4" />
						</button>
					) : (
						<XIcon className="w-4 h-4" />
					)
				}
			>
				{/* Search Input */}
				<div className="p-2 border-b">
					<div className="flex items-center gap-2">
						<Search className="h-4 w-4 text-muted-foreground shrink-0" />
						<Input
							ref={inputRef}
							value={options?.query || ""}
							className="focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 outline-none border-0 h-10"
							placeholder="Search your screen activity..."
							onChange={(e) => {
								setOptions((prev) => ({ ...prev, query: e.target.value }));
							}}
							onKeyDown={handleKeyDown}
						/>
						{isSearching && <Loader2 className="h-4 w-4 animate-spin" />}
					</div>
					<div className="flex w-full gap-2 mt-2">
						<div className="w-1/2">
							<AppSelect
								apps={options.apps || []}
								setApps={(values) => {
									setOptions((prev) => ({ ...prev, apps: values }));
								}}
							/>
						</div>
						<div className="w-1/2">
							<DatePickerWithRange
								start_time={options.start_time}
								end_time={options.end_time}
								setDateRange={(range) => {
									setOptions((prev) => ({
										...prev,
										start_time: range?.from ?? null,
										end_time: range?.to ?? null,
									}));
								}}
							/>
						</div>
					</div>
				</div>

				{/* Search Results */}
				{hasSearched && (
					<div className="max-h-[200px] overflow-y-auto border-b">
						{results.length === 0 && !isSearching ? (
							<p className="text-center text-muted-foreground py-4 text-sm">No results found</p>
						) : (
							<div className="divide-y">
								{results.slice(0, 5).map((result, index) => (
									<div key={index} className="p-2 hover:bg-muted/50">
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="text-xs shrink-0">
												{result.type}
											</Badge>
											<span className="text-xs text-muted-foreground shrink-0">
												{result.content.app_name || result.content.device_name || "Unknown"}
											</span>
										</div>
										<p className="text-sm mt-1 line-clamp-2">{formatResult(result)}</p>
									</div>
								))}
								{results.length > 5 && (
									<button
										onClick={() => commands.openSearchWindow(querySerializer(options))}
										className="w-full p-2 text-sm text-muted-foreground hover:bg-muted/50 text-center"
									>
										+{results.length - 5} more results - click to view all
									</button>
								)}
							</div>
						)}
					</div>
				)}

				{/* AI Chat Section */}
				<div className="flex flex-col">
					{/* Messages */}
					{messages.length > 0 && (
						<div className="max-h-[200px] overflow-y-auto p-3 space-y-3">
							{messages.map((message) => (
								<div
									key={message.id}
									className={cn(
										"flex gap-2",
										message.role === "user" ? "flex-row-reverse" : "flex-row"
									)}
								>
									<div
										className={cn(
											"flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
											message.role === "user"
												? "bg-primary text-primary-foreground"
												: "bg-muted text-muted-foreground"
										)}
									>
										{message.role === "user" ? (
											<User className="h-3 w-3" />
										) : (
											<Bot className="h-3 w-3" />
										)}
									</div>
									<div
										className={cn(
											"flex-1 rounded-lg px-3 py-2 text-sm",
											message.role === "user"
												? "bg-primary text-primary-foreground"
												: "bg-muted"
										)}
									>
										<ReactMarkdown className="prose prose-sm max-w-none dark:prose-invert">
											{message.content}
										</ReactMarkdown>
									</div>
								</div>
							))}
							{isAiLoading && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									<span className="text-sm">Searching your data...</span>
								</div>
							)}
							<div ref={messagesEndRef} />
						</div>
					)}

					{/* AI Input */}
					<form onSubmit={handleAiSubmit} className="p-2 border-t bg-muted/30">
						<div className="flex items-center gap-2">
							<Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
							<Input
								value={aiInput}
								onChange={(e) => setAiInput(e.target.value)}
								placeholder={user?.token ? "Ask AI about your screen activity..." : "Sign in to use AI"}
								disabled={isAiLoading || !user?.token}
								className="flex-1 h-9 border-0 bg-transparent focus-visible:ring-0"
							/>
							<Button
								type={isStreaming ? "button" : "submit"}
								size="icon"
								variant="ghost"
								className="h-8 w-8"
								disabled={(!aiInput.trim() && !isStreaming) || !user?.token}
								onClick={isStreaming ? handleStop : undefined}
							>
								{isStreaming ? (
									<Square className="h-4 w-4" />
								) : (
									<Send className="h-4 w-4" />
								)}
							</Button>
						</div>
					</form>
				</div>
			</CustomDialogContent>
		</Dialog>
	);
}

interface AppSelectProps {
	apps: string[];
	setApps: (values: string[]) => void;
}

export function AppSelect({ apps, setApps }: AppSelectProps) {
	const { items, isLoading } = useSqlAutocomplete("app");

	const appItems = React.useMemo(() => {
		return items.map((app) => ({
			value: app.name,
			count: app.count,
			label: app.name,
		}));
	}, [items]);

	const renderTech = (option: (typeof appItems)[number]) => (
		<div className="flex items-center gap-2">
			<span className="text-xl">
				<img
					src={`http://localhost:11435/app-icon?name=${option.value}`}
					className="w-6 h-6"
					alt={option.value}
					loading="lazy"
					decoding="async"
				/>
			</span>
			<div className="flex flex-col">
				<span>{option.label}</span>
			</div>
		</div>
	);

	const renderSelected = (value: string[]) => (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger className="h-full">
					<div className="flex gap-1 h-full">
						{value.map((id) => {
							const tech = appItems.find((t) => t.value === id)!;

							if (!tech) return;
							return (
								<span key={id}>
									{
										<img
											src={`http://localhost:11435/app-icon?name=${tech.label}`}
											className="w-6 h-6"
											alt={tech.label}
											loading="lazy"
											decoding="async"
										/>
									}
								</span>
							);
						})}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					{value.map((id) => {
						const tech = appItems.find((t) => t.value === id)!;
						if (!tech) return;
						return <div key={id}>{tech.label}</div>;
					})}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	return (
		<MultiSelectCombobox
			label="Applications"
			options={appItems}
			value={apps}
			onChange={setApps}
			renderItem={renderTech}
			renderSelectedItem={renderSelected}
			isLoading={isLoading}
		/>
	);
}
