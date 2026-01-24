"use client";

import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect } from "react";
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
import { ArrowRight, XIcon, Search, Loader2 } from "lucide-react";
import { useQueryStates } from "nuqs";
import { commands } from "@/lib/utils/tauri";
import { Badge } from "./ui/badge";
import { usePlatform } from "@/lib/hooks/use-platform";

const SCREENPIPE_API = "http://localhost:3030";

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

export function SearchCommand() {
	const [open, setOpen] = React.useState(false);
	const { isMac } = usePlatform();

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
		}
	}, [open]);

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

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (options.query?.trim()) {
				commands.openSearchWindow(querySerializer(options));
				setOpen(false);
			}
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
					hasSearched ? "max-h-[80vh]" : ""
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
							value={options?.query || ""}
							className="focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 outline-none border-0 h-10"
							placeholder="Search your screen activity..."
							onChange={(e) => {
								setOptions((prev) => ({ ...prev, query: e.target.value }));
							}}
							onKeyDown={handleKeyDown}
							autoFocus
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
					<div className="max-h-[300px] overflow-y-auto">
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

				{/* Hint for AI chat */}
				<div className="px-3 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
					<span>Press Enter to search</span>
					<span>{isMac ? "⌘L" : "Ctrl+L"} for AI chat</span>
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
