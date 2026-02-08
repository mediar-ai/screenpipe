import { create } from "zustand";
import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { hasFramesForDate } from "../actions/has-frames-date";
import { subDays } from "date-fns";
import { saveFramesToCache, loadCachedFrames } from "./use-timeline-cache";

// Frame buffer for batching updates - reduces 68 re-renders to ~3-5
let frameBuffer: StreamTimeSeriesResponse[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let progressUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 150; // Flush every 150ms for smooth progressive loading
const PROGRESS_UPDATE_INTERVAL_MS = 500; // Only update progress indicator every 500ms to prevent flickering

// Connection retry logic - don't show error immediately, server might be starting
let connectionAttempts = 0;
let errorGraceTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_SILENT_RETRIES = 5; // Increased from 3 - retry more before showing error
const RETRY_DELAY_MS = 2000; // Wait 2 seconds between retries

// Request timeout logic - retry if no frames arrive
let requestTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let requestRetryCount = 0;
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds to receive frames
const MAX_REQUEST_RETRIES = 3; // Retry request 3 times before giving up

// Reconnect timeout - must be tracked to prevent cascade
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

// Track the current WebSocket instance to ignore events from old connections
let currentWsId = 0;

// Cache save debounce
let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
const CACHE_SAVE_DEBOUNCE_MS = 2000; // Save cache 2s after last frame update

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
	// Track new frames for animation and position adjustment
	newFramesCount: number; // How many new frames were added at the front (for animation)
	lastFlushTimestamp: number; // Timestamp of last flush (to trigger effects)
	// Optimistic UI state
	isConnected: boolean; // WebSocket connection status
	hasCachedData: boolean; // Whether we loaded from cache

	// Deep link navigation — persists across component mounts
	pendingNavigation: { timestamp: string; frameId?: string } | null;

	// Actions
	setPendingNavigation: (nav: { timestamp: string; frameId?: string } | null) => void;
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
	onWindowFocus: () => void;
	clearNewFramesCount: () => void;
	clearSentRequestForDate: (date: Date) => void;
	clearFramesForNavigation: () => void; // Clear frames when navigating to new date
	loadFromCache: () => Promise<void>; // Load cached frames on startup
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
	newFramesCount: 0,
	lastFlushTimestamp: 0,
	isConnected: false,
	hasCachedData: false,
	pendingNavigation: null,

	setPendingNavigation: (nav) => set({ pendingNavigation: nav }),
	setFrames: (frames) => set({ frames }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setError: (error) => set({ error }),
	setMessage: (message) => set({ message }),
	setCurrentDate: (date) => set({ currentDate: date }),
	clearNewFramesCount: () => set({ newFramesCount: 0 }),

	clearSentRequestForDate: (date: Date) => {
		const dateKey = `${date.getDate()}-${date.getMonth()}-${date.getFullYear()}`;
		set((state) => {
			const newSentRequests = new Set(state.sentRequests);
			newSentRequests.delete(dateKey);
			return { sentRequests: newSentRequests };
		});
	},

	// Load cached frames for instant display
	loadFromCache: async () => {
		try {
			const cached = await loadCachedFrames();
			if (cached && cached.frames.length > 0) {
				const cachedDate = new Date(cached.date);
				const today = new Date();
				const isToday = cachedDate.toDateString() === today.toDateString();
				const timestamps = new Set(cached.frames.map(f => f.timestamp));
				
				// Only use cached frames if they're from today
				// Otherwise start fresh with today's date
				set({
					frames: isToday ? cached.frames : [],
					frameTimestamps: isToday ? timestamps : new Set<string>(),
					currentDate: today, // Always use today, not cached date
					isLoading: !isToday, // Show loading if cache is stale
					hasCachedData: isToday,
					message: null,
					error: null,
				});
				
				console.log(`Loaded ${cached.frames.length} frames from cache (isToday: ${isToday})`);
			}
		} catch (error) {
			console.warn("Failed to load from cache:", error);
		}
	},

	// Clear frames when navigating to a new date to avoid confusion between old/new frames
	clearFramesForNavigation: () => {
		// Clear the frame buffer too
		frameBuffer = [];
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		// DON'T clear frames - keep showing current data while loading new date.
		// Clearing causes visible "jumping" as frames stream in one-by-one.
		// The pendingNavigation effect in timeline.tsx filters by target date
		// when selecting the correct frame after navigation completes.
		set((state) => ({
			sentRequests: new Set<string>(),
			isLoading: true,
			loadingProgress: { loaded: state.frames.length, isStreaming: false },
			error: null,
			message: "loading...",
		}));
	},

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

			// Frames received - clear the request timeout (no need to retry)
			if (requestTimeoutTimer) {
				clearTimeout(requestTimeoutTimer);
				requestTimeoutTimer = null;
			}
			requestRetryCount = 0; // Reset retry count on success

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

			// Count how many new frames ended up at the front (newer than previous newest)
			// This is used for: 1) animation pulse, 2) adjusting currentIndex when not at live edge
			const previousNewest = state.frames[0]?.timestamp;
			let newAtFront = 0;
			if (previousNewest) {
				for (const frame of mergedFrames) {
					if (frame.timestamp.localeCompare(previousNewest) > 0) {
						newAtFront++;
					} else {
						break; // Sorted descending, so once we hit older frames, stop
					}
				}
			}

			// Debounce cache save - don't save on every flush
			if (cacheSaveTimer) {
				clearTimeout(cacheSaveTimer);
			}
			cacheSaveTimer = setTimeout(() => {
				cacheSaveTimer = null;
				saveFramesToCache(mergedFrames, state.currentDate);
			}, CACHE_SAVE_DEBOUNCE_MS);

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
				newFramesCount: newAtFront,
				lastFlushTimestamp: Date.now(),
			};
		});
	},

	connectWebSocket: () => {
		// Cancel any pending reconnect timeout to prevent cascade
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		// Increment WebSocket ID to invalidate old connection handlers
		currentWsId++;
		const thisWsId = currentWsId;

		// Close existing websocket if any (including CONNECTING state to handle React Strict Mode double-render)
		const existingWs = get().websocket;
		if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) {
			existingWs.close();
		}

		// OPTIMISTIC: Don't reset frames on reconnect - keep showing existing data
		// Only reset request tracking and connection state
		const currentFrames = get().frames;
		const currentTimestamps = get().frameTimestamps;
		
		set({
			// Keep existing frames visible!
			frames: currentFrames,
			frameTimestamps: currentTimestamps,
			sentRequests: new Set<string>(),
			isLoading: currentFrames.length === 0, // Only show loading if no frames
			loadingProgress: { loaded: currentFrames.length, isStreaming: false },
			error: null,
			message: currentFrames.length > 0 ? null : "connecting...",
			isConnected: false,
		});
		
		frameBuffer = [];
		requestRetryCount = 0; // Reset retry counter on reconnection
		if (progressUpdateTimer) {
			clearTimeout(progressUpdateTimer);
			progressUpdateTimer = null;
		}
		if (requestTimeoutTimer) {
			clearTimeout(requestTimeoutTimer);
			requestTimeoutTimer = null;
		}

		const ws = new WebSocket("ws://localhost:3030/stream/frames");

		ws.onopen = () => {
			// Ignore events from old WebSocket instances
			if (thisWsId !== currentWsId) return;

			// Reset retry counter on successful connection
			connectionAttempts = 0;
			if (errorGraceTimer) {
				clearTimeout(errorGraceTimer);
				errorGraceTimer = null;
			}

			const currentFrames = get().frames;
			set({
				websocket: ws,
				error: null,
				message: null,
				isLoading: currentFrames.length === 0,
				loadingProgress: { loaded: currentFrames.length, isStreaming: true },
				isConnected: true,
			});
			console.log("WebSocket connection established");

			// After successful connection/reconnection, trigger a fetch for current date
			// This ensures data is requested even after reconnection
			setTimeout(() => {
				const { currentDate, fetchTimeRange } = get();
				const startTime = new Date(currentDate);
				startTime.setHours(0, 0, 0, 0);
				const endTime = new Date(currentDate);
				// Always use end of day so server keeps polling for new frames
				// Server checks `now <= end_time` to decide whether to poll
				endTime.setHours(23, 59, 59, 999);
				fetchTimeRange(startTime, endTime);
			}, 100);
		};

		ws.onmessage = (event) => {
			// Ignore events from old WebSocket instances
			if (thisWsId !== currentWsId) return;

			try {
				const data = JSON.parse(event.data);

				// Handle keep-alive messages
				if (data === "keep-alive-text") {
					// Flush any pending frames when we get keep-alive
					get().flushFrameBuffer();
					const currentFrames = get().frames;
					set((state) => ({
						error: null,
						isLoading: false,
						message: currentFrames.length === 0 ? "waiting for data..." : null,
					}));
					return;
				}

				// Handle error messages
				if (data.error) {
					get().flushFrameBuffer(); // Flush before error
					// OPTIMISTIC: Don't show error if we have frames
					const currentFrames = get().frames;
					if (currentFrames.length === 0) {
						set({ error: data.error, isLoading: false });
					}
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
				// OPTIMISTIC: Don't show error if we have frames
				const currentFrames = get().frames;
				if (currentFrames.length === 0) {
					set({
						error: "Failed to parse server response",
						isLoading: false,
					});
				}
			}
		};

		ws.onerror = (error) => {
			// Ignore events from old WebSocket instances
			if (thisWsId !== currentWsId) return;

			console.error("WebSocket error:", error);
			connectionAttempts++;

			const currentFrames = get().frames;

			// Silent retry if under max attempts (server might be starting)
			if (connectionAttempts < MAX_SILENT_RETRIES) {
				console.log(`Connection attempt ${connectionAttempts}/${MAX_SILENT_RETRIES}, retrying...`);
				// OPTIMISTIC: Keep showing existing frames, just update connection status
				set({ 
					isLoading: currentFrames.length === 0, 
					message: currentFrames.length === 0 ? "connecting to screenpipe..." : null,
					isConnected: false,
				});

				// Schedule retry
				if (!errorGraceTimer) {
					errorGraceTimer = setTimeout(() => {
						errorGraceTimer = null;
						get().connectWebSocket();
					}, RETRY_DELAY_MS);
				}
			} else {
				// Max retries exceeded - but still don't block if we have frames
				if (currentFrames.length === 0) {
					set({ error: "Connection error occurred", isLoading: false, isConnected: false });
				} else {
					// Have frames - show subtle indicator, not error
					set({ error: null, isLoading: false, isConnected: false, message: null });
				}
			}
		};

		ws.onclose = () => {
			// Ignore events from old WebSocket instances (e.g., when refresh button is clicked)
			if (thisWsId !== currentWsId) {
				console.log("Ignoring onclose from old WebSocket instance");
				return;
			}

			// Flush any remaining frames before closing
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}
			if (progressUpdateTimer) {
				clearTimeout(progressUpdateTimer);
				progressUpdateTimer = null;
			}
			if (requestTimeoutTimer) {
				clearTimeout(requestTimeoutTimer);
				requestTimeoutTimer = null;
			}
			get().flushFrameBuffer();

			const currentFrames = get().frames;
			
			// OPTIMISTIC: Only show message if no frames
			if (connectionAttempts === 0 && currentFrames.length === 0) {
				set({
					message: "Connection closed",
					isLoading: false,
					loadingProgress: { loaded: 0, isStreaming: false },
					isConnected: false,
				});
			} else {
				set({ isConnected: false });
			}

			// Reset attempts and reconnect after delay (tracked to prevent cascade)
			reconnectTimeout = setTimeout(() => {
				reconnectTimeout = null;
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
			console.log("sending request for", requestKey);
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

			// Start timeout - if no frames arrive, retry
			if (requestTimeoutTimer) {
				clearTimeout(requestTimeoutTimer);
			}
			requestTimeoutTimer = setTimeout(() => {
				requestTimeoutTimer = null;
				const currentFrames = get().frames;

				// If still no frames and we haven't exceeded retries, retry
				if (currentFrames.length === 0 && requestRetryCount < MAX_REQUEST_RETRIES) {
					requestRetryCount++;
					console.log(`No frames received, retrying (${requestRetryCount}/${MAX_REQUEST_RETRIES})...`);

					// Clear this date from sentRequests to allow retry
					set((state) => {
						const newSentRequests = new Set(state.sentRequests);
						newSentRequests.delete(requestKey);
						return { sentRequests: newSentRequests };
					});

					// Retry the request
					get().fetchTimeRange(startTime, endTime);
				} else if (currentFrames.length === 0 && requestRetryCount >= MAX_REQUEST_RETRIES) {
					console.log("Max retries reached, no frames available");
					set({
						isLoading: false,
						message: "No data available for this time range"
					});
				}
			}, REQUEST_TIMEOUT_MS);
		}
	},

	fetchNextDayData: async (date: Date) => {
		const hasFrames = await hasFramesForDate(date);

		if (!hasFrames) {
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

	onWindowFocus: () => {
		const { currentDate, websocket, fetchTimeRange, connectWebSocket } = get();

		// Clear current date from sentRequests to allow re-fetch
		const dateKey = `${currentDate.getDate()}-${currentDate.getMonth()}-${currentDate.getFullYear()}`;
		set((state) => {
			const newSentRequests = new Set(state.sentRequests);
			newSentRequests.delete(dateKey);
			return { sentRequests: newSentRequests };
		});

		console.log("Window focused, cleared sentRequests for:", dateKey);

		// If WebSocket is open, fetch fresh data
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			const startTime = new Date(currentDate);
			startTime.setHours(0, 0, 0, 0);
			const endTime = new Date(currentDate);
			endTime.setHours(23, 59, 59, 999);
			fetchTimeRange(startTime, endTime);
		} else {
			// WebSocket is closed, reconnect (which will fetch on open)
			console.log("WebSocket not open, reconnecting...");
			connectWebSocket();
		}
	},
}));
