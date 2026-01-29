"use client";

import { DatePickerWithRange } from "@/components/rewind/date-range-picker";
import { ImageGrid, MainImage, SkeletonCard } from "@/components/rewind/image-card";
import { SearchBar } from "@/components/rewind/search-bar";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";
import { endOfDay, startOfDay, format } from "date-fns";
import { useCallback, useEffect, useRef, Suspense } from "react";
import { parser } from "@/lib/keyword-parser";
import { CurrentFrame } from "@/components/rewind/current-frame-search";
import { useKeywordParams } from "@/lib/hooks/use-keyword-params";
import { AppSelect } from "@/components/rewind/search-command";
import { ArrowLeft, Clock, MessageSquare } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { commands } from "@/lib/utils/tauri";

function SearchPage() {
	const [querys, setQuerys] = useKeywordParams();
	const debounceQuerys = useDebounce(querys, 300);
	const {
		searchKeywords,
		isSearching,
		searchResults,
		currentResultIndex,
		setCurrentResultIndex,
	} = useKeywordSearchStore();
	const pageRef = useRef<HTMLDivElement>(null);

	const handleSearch = useCallback(
		async (
			query: string,
			start: Date | undefined,
			end: Date | undefined,
			app_names: string[] | undefined,
		) => {
			await searchKeywords(query, {
				limit: 20,
				offset: 0,
				start_time: start,
				end_time: end,
				app_names,
			});
		},
		[searchResults],
	);

	useEffect(() => {
		if (!debounceQuerys.query || debounceQuerys.query.length === 0) {
			setCurrentResultIndex(-1);
			return;
		}

		const keywords = parser.parse(debounceQuerys.query);
		if (keywords.keywords.length === 0) return;

		console.log(keywords.keywords);

		handleSearch(
			keywords.keywords.join(" "),
			debounceQuerys.start_time ?? undefined,
			debounceQuerys.end_time ?? undefined,
			debounceQuerys.apps?.length ? debounceQuerys.apps : undefined,
		);
	}, [debounceQuerys]);

	useEffect(() => {
		console.log(currentResultIndex);
	}, [currentResultIndex]);

	return (
		<div
			ref={pageRef}
			className="mx-auto flex flex-col justify-between space-y-4 animate-fade-in p-4 min-h-screen overflow-hidden"
		>
			<div className="space-y-4 ">
				<div className="flex items-center gap-4 justify-center">
					<div className="grid grid-cols-3 gap-4 items-center h-10">
						<SearchBar
							search={querys.query}
							onSearchChange={(query) => {
								setQuerys((prev) => ({
									...prev,
									query,
								}));
							}}
							autoFocus
						/>
						<DatePickerWithRange
							start_time={querys.start_time}
							end_time={querys.end_time}
							setDateRange={(dates) => {
								setQuerys((prev) => ({
									...prev,
									start_time: dates?.from ? startOfDay(dates?.from) : null,
									end_time: dates?.to ? endOfDay(dates?.to) : null,
								}));
							}}
						/>
						<AppSelect
							apps={querys.apps ?? []}
							setApps={(values) => {
								setQuerys((prev) => ({
									...prev,
									apps: values,
								}));
							}}
						/>
					</div>
				</div>
				<div className="relative">
					<CurrentFrame />
					{currentResultIndex >= 0 && searchResults[currentResultIndex] && (
						<div className="absolute bottom-2 right-2 flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								className="gap-1.5"
								onClick={async () => {
									const result = searchResults[currentResultIndex];
									// Build context for AI chat
									const context = `Context from search result:\n${result.app_name} - ${result.window_name}\nTime: ${format(new Date(result.timestamp), "PPpp")}\n\nText:\n${result.text || ""}`;
									// Open AI chat window with context
									await commands.showWindow("Chat");
									await emit("chat-prefill", { context });
								}}
							>
								<MessageSquare className="h-3.5 w-3.5" />
								ask AI
							</Button>
							<Button
								variant="secondary"
								size="sm"
								className="gap-1.5"
								onClick={async () => {
									const timestamp = searchResults[currentResultIndex].timestamp;
									// Show main timeline window
									await commands.showWindow("Main");
									// Emit event to navigate to the timestamp
									await emit("navigate-to-timestamp", timestamp);
									// Close search window
									await commands.closeWindow({ Search: { query: null } });
								}}
							>
								<Clock className="h-3.5 w-3.5" />
								view in timeline
							</Button>
						</div>
					)}
				</div>
			</div>
			{!querys.query && (
				<div className="h-64 w-96 flex mx-auto items-center justify-center">
					<p className="text-sm text-gray-500">
						Please provide query for searching
					</p>
				</div>
			)}

			{!isSearching && searchResults.length === 0 && querys.query ? (
				<div className="h-64 w-96 flex mx-auto items-center justify-center whitespace-nowrap">
					<p className="text-sm text-gray-500">
						No results found for &quot;{querys.query}&quot;
					</p>
				</div>
			) : null}

			{isSearching && searchResults.length === 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
					{Array.from({ length: 15 }).map((_, index) => (
						<SkeletonCard key={`skeleton-${index}`} />
					))}
				</div>
			)}

			{querys.query && !(searchResults.length === 0) ? (
				<div className="flex-1 overflow-hidden">
					<ImageGrid searchResult={searchResults} pageRef={pageRef} />
				</div>
			) : (
				<div></div>
			)}
		</div>
	);
}

export default function Page() {
	return (
		<Suspense fallback={<div>Loading...</div>}>
			<SearchPage />
		</Suspense>
	);
}
