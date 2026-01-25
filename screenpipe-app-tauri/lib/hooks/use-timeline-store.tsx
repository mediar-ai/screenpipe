import { create } from "zustand";
import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { hasFramesForDate } from "../actions/has-frames-date";
import { subDays } from "date-fns";

// Frame buffer for batching updates - reduces 68 re-renders to ~3-5
let frameBuffer: StreamTimeSeriesResponse[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let progressUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 150; // Flush every 150ms for smooth progressive loading
const PROGRESS_UPDATE_INTERVAL_MS = 500; // Only update progress indicator every 500ms to prevent flickering

// Connection retry logic - don't show error immediately, server might be starting
let connectionAttempts = 0;
let errorGraceTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_SILENT_RETRIES = 3; // Retry 3 times before showing error
const RETRY_DELAY_MS = 2000; // Wait 2 seconds between retries

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
	flushFrameBuffer: () => void;
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

	// Flush accumulated frames to state - called periodically instead of on every message
	flushFrameBuffer: () => {
		if (frameBuffer.length === 0) return;

		const framesToFlush = frameBuffer;
		frameBuffer = [];

		set((state) => {
			// Filter out duplicates using O(1) Set lookup
			const newUniqueFrames = framesToFlush.filter(
				(frame) => !state.frameTimestamps.has(frame.timestamp)
			);

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

			// Single sort per flush instead of per-message
			// Parse timestamps once for sorting
			const mergedFrames = [...state.frames, ...newUniqueFrames].sort(
				(a, b) => {
					// Direct string comparison works for ISO timestamps (lexicographic = chronologic)
					return b.timestamp.localeCompare(a.timestamp);
				}
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
	},

	connectWebSocket: () => {
		// Close existing websocket if any
		const existingWs = get().websocket;
		if (existingWs && existingWs.readyState === WebSocket.OPEN) {
			existingWs.close();
		}

		// Reset state for fresh data when reconnecting
		set({
			frames: [],
			frameTimestamps: new Set<string>(),
			sentRequests: new Set<string>(),
			isLoading: true,
			loadingProgress: { loaded: 0, isStreaming: false },
			error: null,
			message: null,
		});
		frameBuffer = [];
		if (progressUpdateTimer) {
			clearTimeout(progressUpdateTimer);
			progressUpdateTimer = null;
		}

		const ws = new WebSocket("ws://localhost:3030/stream/frames");

		ws.onopen = () => {
			// Reset retry counter on successful connection
			connectionAttempts = 0;
			if (errorGraceTimer) {
				clearTimeout(errorGraceTimer);
				errorGraceTimer = null;
			}

			set({
				websocket: ws,
				error: null,
				message: null,
				isLoading: true,
				loadingProgress: { loaded: 0, isStreaming: true }
			});
			console.log("WebSocket connection established");

			// After successful connection/reconnection, trigger a fetch for current date
			// This ensures data is requested even after reconnection
			setTimeout(() => {
				const { currentDate, fetchTimeRange } = get();
				const startTime = new Date(currentDate);
				startTime.setHours(0, 0, 0, 0);
				const endTime = new Date(currentDate);
				if (endTime.getDate() === new Date().getDate()) {
					// For today: use current time for real-time polling
				} else {
					endTime.setHours(23, 59, 59, 999);
				}
				fetchTimeRange(startTime, endTime);
			}, 100);
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				// Handle keep-alive messages
				if (data === "keep-alive-text") {
					// Flush any pending frames when we get keep-alive
					get().flushFrameBuffer();
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
					get().flushFrameBuffer(); // Flush before error
					set({ error: data.error, isLoading: false });
					return;
				}

				// Handle batched frames - OPTIMIZED: buffer and flush periodically
				if (Array.isArray(data)) {
					// Add to buffer instead of immediate state update
					frameBuffer.push(...data);

					// Schedule flush if not already scheduled
					if (!flushTimer) {
						flushTimer = setTimeout(() => {
							flushTimer = null;
							get().flushFrameBuffer();
						}, FLUSH_INTERVAL_MS);
					}

					// Debounce progress updates to prevent timeline flickering
					// Only update every 500ms instead of on every message
					if (!progressUpdateTimer) {
						progressUpdateTimer = setTimeout(() => {
							progressUpdateTimer = null;
							const currentTotal = get().frames.length + frameBuffer.length;
							set({
								loadingProgress: {
									loaded: currentTotal,
									isStreaming: true
								}
							});
						}, PROGRESS_UPDATE_INTERVAL_MS);
					}
					return;
				}

				// Handle single frame (legacy support)
				if (data.timestamp && data.devices) {
					frameBuffer.push(data);

					if (!flushTimer) {
						flushTimer = setTimeout(() => {
							flushTimer = null;
							get().flushFrameBuffer();
						}, FLUSH_INTERVAL_MS);
					}
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
			connectionAttempts++;

			// Silent retry if under max attempts (server might be starting)
			if (connectionAttempts < MAX_SILENT_RETRIES) {
				console.log(`Connection attempt ${connectionAttempts}/${MAX_SILENT_RETRIES}, retrying...`);
				// Keep showing loading state, not error
				set({ isLoading: true, message: "connecting to screenpipe..." });

				// Schedule retry
				if (!errorGraceTimer) {
					errorGraceTimer = setTimeout(() => {
						errorGraceTimer = null;
						get().connectWebSocket();
					}, RETRY_DELAY_MS);
				}
			} else {
				// Max retries exceeded, show error
				set({ error: "Connection error occurred", isLoading: false });
			}
		};

		ws.onclose = () => {
			// Flush any remaining frames before closing
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}
			if (progressUpdateTimer) {
				clearTimeout(progressUpdateTimer);
				progressUpdateTimer = null;
			}
			get().flushFrameBuffer();

			// Only show "Connection closed" if we had a successful connection before
			if (connectionAttempts === 0) {
				set({
					message: "Connection closed",
					isLoading: false,
					loadingProgress: { loaded: get().frames.length, isStreaming: false }
				});
			}

			// Reset attempts and reconnect after delay
			setTimeout(() => {
				connectionAttempts = 0; // Fresh start for reconnection
				get().connectWebSocket();
			}, 5000);
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

