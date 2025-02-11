import { create } from "zustand";

export interface SearchMatch {
	frame_id: number;
	timestamp: string;
	text_positions: Array<{
		text: string;
		confidence: number;
		bounds: {
			left: number;
			top: number;
			width: number;
			height: number;
		};
	}>;
	app_name: string;
	window_name: string;
	confidence: number;
	text: string;
}

export interface SearchRequest {
	query: string;
	timestamp: number;
	params: {
		offset?: number;
		limit?: number;
		start_time?: string;
		end_time?: string;
		fuzzy_match?: boolean;
		order?: "ascending" | "descending";
	};
}

export interface KeywordSearchState {
	searchResults: SearchMatch[];
	currentResultIndex: number;
	isSearching: boolean;
	searchQuery: string;
	error: string | null;
	lastRequest: SearchRequest | null;

	searchKeywords: (
		query: string,
		options?: {
			limit?: number;
			offset?: number;
			include_context?: boolean;
			start_time?: Date;
			end_time?: Date;
			fuzzy_match?: boolean;
			order?: "ascending" | "descending";
		},
	) => Promise<void>;
	setCurrentResultIndex: (index: number) => void;
	resetSearch: () => void;
	nextResult: () => void;
	previousResult: () => void;
}

const fuzzy_default = true;
const offset_default = 0;

export const useKeywordSearchStore = create<KeywordSearchState>((set, get) => ({
	searchResults: [],
	currentResultIndex: -1,
	isSearching: false,
	searchQuery: "",
	error: null,
	lastRequest: null,

	searchKeywords: async (query, options = {}) => {
		if (query.length === 0) return;

		const isInitialSearch = !options.offset || options.offset === 0;
		if (isInitialSearch && query !== get().searchQuery) {
			set({
				searchResults: [],
				currentResultIndex: -1,
			});
		}

		const { searchResults, lastRequest } = get();

		const searchSignature = JSON.stringify({
			query,
			offset: options.offset || offset_default,
			limit: options.limit,
			start_time: options.start_time?.toISOString(),
			end_time: options.end_time?.toISOString(),
			fuzzy_match: options.fuzzy_match ?? fuzzy_default,
			order: options.order ?? "descending",
		});

		if (
			lastRequest &&
			JSON.stringify({
				query: lastRequest.query,
				...lastRequest.params,
			}) === searchSignature
		) {
			return;
		}

		const searchRequest: SearchRequest = {
			query,
			timestamp: Date.now(),
			params: {
				offset: options.offset || offset_default,
				limit: options.limit,
				start_time: options.start_time?.toISOString(),
				end_time: options.end_time?.toISOString(),
				fuzzy_match: options.fuzzy_match ?? fuzzy_default,
				order: options.order ?? "descending",
			},
		};

		set({
			lastRequest: searchRequest,
			isSearching: true,
			error: null,
		});

		try {
			const params = new URLSearchParams({
				query,
				offset: (options.offset ?? 0).toString(),
				include_context: (options.include_context ?? false).toString(),
				fuzzy_match: (options.fuzzy_match ?? true).toString(),
			});

			if (options.start_time) {
				params.append("start_time", options.start_time.toISOString());
			}

			if (options.end_time) {
				const now = new Date();
				const end = options.end_time;

				if (
					end.getDate() === now.getDate() &&
					end.getMonth() === now.getMonth() &&
					end.getFullYear() === now.getFullYear()
				) {
					const fiveMinutesAgo = new Date(now.getTime() - 10 * 60000);
					params.append("end_time", fiveMinutesAgo.toISOString());
				} else {
					params.append("end_time", end.toISOString());
				}
			} else {
				const now = new Date();
				const fiveMinutesAgo = new Date(now.getTime() - 10 * 60000);
				fiveMinutesAgo.setSeconds(0, 0);
				params.append("end_time", fiveMinutesAgo.toISOString());
			}

			if (options.order) {
				params.append("order", options.order);
			}

			if (options.limit) {
				params.append("limit", options.limit.toString());
			}

			const response = await fetch(
				`http://localhost:3030/search/keyword?${params}`,
			);

			if (!response.ok) {
				throw new Error("Search request failed");
			}

			const results = await response.json();

			if (!isInitialSearch) {
				const existingFrameIds = new Set(searchResults.map((r) => r.frame_id));
				const uniqueNewResults = results.filter(
					(result: SearchMatch) => !existingFrameIds.has(result.frame_id),
				);

				set({
					searchResults: [...searchResults, ...uniqueNewResults],
					currentResultIndex: get().currentResultIndex,
					searchQuery: query,
				});
			} else {
				set({
					searchResults: results,
					currentResultIndex: results.length > 0 ? 0 : -1,
					searchQuery: query,
				});
			}
		} catch (error) {
			set({ error: error instanceof Error ? error.message : "Search failed" });
		} finally {
			set({ isSearching: false });
		}
	},

	setCurrentResultIndex: (index) => {
		set({ currentResultIndex: index });
	},

	resetSearch: () => {
		const { lastRequest } = get();
		set({
			searchResults: [],
			currentResultIndex: -1,
			isSearching: false,
			searchQuery: "",
			error: null,
			lastRequest,
		});
	},

	nextResult: () => {
		const { searchResults, currentResultIndex } = get();
		if (searchResults.length === 0) return;

		const nextIndex = (currentResultIndex + 1) % searchResults.length;
		set({ currentResultIndex: nextIndex });
	},

	previousResult: () => {
		const { searchResults, currentResultIndex } = get();
		if (searchResults.length === 0) return;

		const prevIndex =
			currentResultIndex - 1 < 0
				? searchResults.length - 1
				: currentResultIndex - 1;
		set({ currentResultIndex: prevIndex });
	},
}));
