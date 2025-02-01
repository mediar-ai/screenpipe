import { create } from "zustand";
import { StreamTimeSeriesResponse } from "@/app/page";
import { hasFramesForDate } from "../actions/has-frames-date";
import { subDays } from "date-fns";

interface TimelineState {
	frames: StreamTimeSeriesResponse[];
	isLoading: boolean;
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
	isLoading: true,
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
			set({ websocket: ws, error: null, message: null, isLoading: true });
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

				// Handle batched frames
				if (Array.isArray(data)) {
					set((state) => {
						const newFrames = [...state.frames];
						const uniqueFrames = new Map();

						// First, add existing frames to the map
						newFrames.forEach((frame) => {
							uniqueFrames.set(frame.timestamp, frame);
						});

						// Add new frames to the map (this automatically handles duplicates)
						data.forEach((frame) => {
							uniqueFrames.set(frame.timestamp, frame);
						});

						// Convert map back to array and sort by timestamp
						const sortedFrames = Array.from(uniqueFrames.values()).sort(
							(a, b) =>
								new Date(b.timestamp).getTime() -
								new Date(a.timestamp).getTime(),
						);

						return {
							frames: sortedFrames,
							isLoading: false,
							message: null,
							error: null,
						};
					});
					return;
				}

				// Handle single frame (legacy support)
				if (data.timestamp && data.devices) {
					set((state) => {
						const timestamp = new Date(data.timestamp).getTime();

						// Check for duplicate
						if (
							state.frames.some(
								(f) => new Date(f.timestamp).getTime() === timestamp,
							)
						) {
							return state;
						}

						// Use binary search to find insertion point
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
							isLoading: false,
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
			set({ message: "Connection closed", isLoading: false });
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
