import { create } from "zustand";
import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { hasFramesForDate } from "../actions/has-frames-date";
import { subDays } from "date-fns";

interface TimelineState {
	frames: StreamTimeSeriesResponse[];
	frameTimestamps: Set<string>; // For O(1) deduplication lookups
	isLoading: boolean;
	loadingProgress: { loaded: number; isStreaming: boolean }; // Track loading progress
	error: string | null;
	message: string | null;
	currentDate: Date;
	websocket: WebSocket | null;
	sentRequests: Set<string>;

	// Actions
	setFrames: (frames: StreamTimeSeriesResponse[]) => void;
	setIsLoading: (isLoading: boolean) => void;
	setError: (error: string | null) => void;
	setMessage: (message: string | null) => void;
	setCurrentDate: (date: Date) => void;
	connectWebSocket: () => void;
	fetchTimeRange: (startTime: Date, endTime: Date) => void;
	fetchNextDayData: (date: Date) => void;
	hasDateBeenFetched: (date: Date) => boolean;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
	frames: [],
	frameTimestamps: new Set<string>(), // O(1) lookup for deduplication
	isLoading: true,
	loadingProgress: { loaded: 0, isStreaming: false },
	error: null,
	message: null,
	currentDate: new Date(),
	websocket: null,
	sentRequests: new Set<string>(),

	setFrames: (frames) => set({ frames }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setError: (error) => set({ error }),
	setMessage: (message) => set({ message }),
	setCurrentDate: (date) => set({ currentDate: date }),

	hasDateBeenFetched: (date: Date) => {
		const { sentRequests } = get();
		const dateKey = `${date.getDate()}-${date.getMonth()}-${date.getFullYear()}`;
		return sentRequests.has(dateKey);
	},
	connectWebSocket: () => {
		const ws = new WebSocket("ws://localhost:3030/stream/frames");

		ws.onopen = () => {
			set({
				websocket: ws,
				error: null,
				message: null,
				isLoading: true,
				loadingProgress: { loaded: 0, isStreaming: true }
			});
			console.log("WebSocket connection established");
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				// Handle keep-alive messages
				if (data === "keep-alive-text") {
					set((state) => ({
						error: null,
						isLoading: false,
						message:
							state.message === "please wait..."
								? state.message
								: "please wait...",
					}));
					return;
				}

				// Handle error messages
				if (data.error) {
					set({ error: data.error, isLoading: false });
					return;
				}

				// Handle batched frames - OPTIMIZED: incremental deduplication
				if (Array.isArray(data)) {
					set((state) => {
						// Filter out frames we already have using O(1) Set lookup
						const newUniqueFrames = data.filter(
							(frame) => !state.frameTimestamps.has(frame.timestamp)
						);

						// If no new frames, just update loading state
						if (newUniqueFrames.length === 0) {
							return {
								isLoading: false,
								loadingProgress: {
									loaded: state.frames.length,
									isStreaming: true
								},
								message: null,
								error: null,
							};
						}

						// Add new timestamps to the Set
						const updatedTimestamps = new Set(state.frameTimestamps);
						newUniqueFrames.forEach((frame) => {
							updatedTimestamps.add(frame.timestamp);
						});

						// Merge and sort only when we have new frames
						// Use insertion sort optimization for mostly-sorted data
						const mergedFrames = [...state.frames, ...newUniqueFrames].sort(
							(a, b) =>
								new Date(b.timestamp).getTime() -
								new Date(a.timestamp).getTime(),
						);

						return {
							frames: mergedFrames,
							frameTimestamps: updatedTimestamps,
							isLoading: false,
							loadingProgress: {
								loaded: mergedFrames.length,
								isStreaming: true
							},
							message: null,
							error: null,
						};
					});
					return;
				}

				// Handle single frame (legacy support) - OPTIMIZED with Set lookup
				if (data.timestamp && data.devices) {
					set((state) => {
						// O(1) duplicate check using Set
						if (state.frameTimestamps.has(data.timestamp)) {
							return state;
						}

						// Add to timestamps Set
						const updatedTimestamps = new Set(state.frameTimestamps);
						updatedTimestamps.add(data.timestamp);

						// Use binary search to find insertion point
						const timestamp = new Date(data.timestamp).getTime();
						const newFrames = [...state.frames];
						let left = 0;
						let right = newFrames.length;

						while (left < right) {
							const mid = Math.floor((left + right) / 2);
							const midTimestamp = new Date(newFrames[mid].timestamp).getTime();
							if (midTimestamp < timestamp) {
								right = mid;
							} else {
								left = mid + 1;
							}
						}

						newFrames.splice(left, 0, data);
						return {
							frames: newFrames,
							frameTimestamps: updatedTimestamps,
							isLoading: false,
							loadingProgress: {
								loaded: newFrames.length,
								isStreaming: true
							},
							message: null,
							error: null,
						};
					});
				}
			} catch (error) {
				console.error("Failed to parse frame data:", error);
				set({
					error: "Failed to parse server response",
					isLoading: false,
				});
			}
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
			set({ error: "Connection error occurred", isLoading: false });
		};

		ws.onclose = () => {
			set({
				message: "Connection closed",
				isLoading: false,
				loadingProgress: { loaded: get().frames.length, isStreaming: false }
			});
			// Attempt to reconnect after a delay
			setTimeout(() => get().connectWebSocket(), 5000);
		};
	},

	fetchTimeRange: async (startTime: Date, endTime: Date) => {
		const { websocket, sentRequests } = get();
		const requestKey = `${startTime.getDate()}-${startTime.getMonth()}-${startTime.getFullYear()}`;

		if (sentRequests.has(requestKey)) {
			console.log("Request already sent, skipping...");
			return;
		}

		if (websocket && websocket.readyState === WebSocket.OPEN) {
			console.log("sending");
			websocket.send(
				JSON.stringify({
					start_time: startTime.toISOString(),
					end_time: endTime.toISOString(),
					order: "descending",
				}),
			);

			set((state) => ({
				sentRequests: new Set(state.sentRequests).add(requestKey),
			}));
		}
	},

	fetchNextDayData: async (date: Date) => {
		const dateFramesLen = await hasFramesForDate(date);

		if (typeof dateFramesLen === "object" && dateFramesLen.error) {
			return;
		}

		if (!dateFramesLen) {
			date = subDays(date, 1);
		}

		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate());
		nextDay.setHours(0, 0, 0, 0);

		const endTime = new Date(nextDay);
		endTime.setHours(23, 59, 59, 999);

		const { websocket, sentRequests } = get();
		const requestKey = `${nextDay.getDate()}-${nextDay.getMonth()}-${nextDay.getFullYear()}`;

		if (sentRequests.has(requestKey)) {
			console.log("Request already sent, skipping...");
			return;
		}

		if (websocket && websocket.readyState === WebSocket.OPEN) {
			websocket.send(
				JSON.stringify({
					start_time: nextDay.toISOString(),
					end_time: endTime.toISOString(),
					order: "descending",
				}),
			);
			set((state) => ({
				sentRequests: new Set(state.sentRequests).add(requestKey),
			}));
		}
	},
}));

