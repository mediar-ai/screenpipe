"use client";

import { DatePickerWithRange } from "@/components/date-range-picker";
import { ImageGrid, MainImage } from "@/components/image-card";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";
import { endOfDay, startOfDay } from "date-fns";
import { useCallback, useEffect, useRef } from "react";
import { parser } from "@/lib/keyword-parser";
import { CurrentFrame } from "@/components/current-frame";
import { useKeywordParams } from "@/lib/hooks/use-keyword-params";
import { AppSelect } from "@/components/search-command";
import { ArrowLeft } from "lucide-react";

export default function Page() {
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
					<Button variant={"link"} asChild>
						<a href={"/"}>
							<ArrowLeft />
							Go Back
						</a>
					</Button>
					<div className="grid grid-cols-3 gap-4 items-center h-10">
						<SearchBar
							search={querys.query}
							onSearchChange={(query) => {
								setQuerys((prev) => ({
									...prev,
									query,
								}));
							}}
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
				<CurrentFrame />
			</div>
			{!querys.query && (
				<div className="h-64 w-96 flex mx-auto items-center justify-center">
					<p className="text-sm text-gray-500">
						Please provide query for searching
					</p>
				</div>
			)}

			{querys.query ? (
				<div className="h-64 flex items-end">
					<ImageGrid searchResult={searchResults} pageRef={pageRef} />
				</div>
			) : (
				<div></div>
			)}
		</div>
	);
}
