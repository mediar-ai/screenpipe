"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Loader2, RotateCcw, AlertCircle, X } from "lucide-react";
import { commands } from "@/lib/utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { AudioTranscript } from "@/components/rewind/timeline/audio-transcript";
import { TimelineProvider } from "@/lib/hooks/use-timeline-selection";
import { throttle } from "lodash";
import { TimelineControls } from "@/components/rewind/timeline/timeline-controls";
import { addDays, endOfDay, isAfter, isSameDay, startOfDay, subDays } from "date-fns";
import { getStartDate } from "@/lib/actions/get-start-date";
import { useTimelineData } from "@/lib/hooks/use-timeline-data";
import { useCurrentFrame } from "@/lib/hooks/use-current-frame";
import { TimelineSlider } from "@/components/rewind/timeline/timeline";
import { useTimelineStore } from "@/lib/hooks/use-timeline-store";
import { hasFramesForDate } from "@/lib/actions/has-frames-date";
import { CurrentFrameTimeline } from "@/components/rewind/current-frame-timeline";
import posthog from "posthog-js";

export interface StreamTimeSeriesResponse {
	timestamp: string;
	devices: DeviceFrameResponse[];
}

export interface DeviceFrameResponse {
	device_id: string;
	frame_id: string;
	frame: string; // base64 encoded image
	metadata: DeviceMetadata;
	audio: AudioData[];
}

export interface DeviceMetadata {
	file_path: string;
	app_name: string;
	window_name: string;
	ocr_text: string;
	timestamp: string;
	browser_url?: string;
}

export interface AudioData {
	device_name: string;
	is_input: boolean;
	transcription: string;
	audio_file_path: string;
	duration_secs: number;
	start_offset: number;
	audio_chunk_id: number;
	speaker_id?: number;
	speaker_name?: string;
}

export interface TimeRange {
	start: Date;
	end: Date;
}

// Add this easing function at the top level
const easeOutCubic = (x: number): number => {
	return 1 - Math.pow(1 - x, 3);
};

export default function Timeline() {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [showAudioTranscript, setShowAudioTranscript] = useState(true);
	const containerRef = useRef<HTMLDivElement | null>(null);
	// const [searchResults, setSearchResults] = useState<number[]>([]);
	const [startAndEndDates, setStartAndEndDates] = useState<TimeRange>({
		// Default to 1 year ago so navigation works even if getStartDate fails
		start: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
		end: new Date(),
	});

	const { currentFrame, setCurrentFrame } = useCurrentFrame((index) => {
		setCurrentIndex(index);
	});

	// Flag to prevent frame-date sync from fighting with intentional navigation
	const isNavigatingRef = useRef(false);

	// Pending navigation target from search - will jump when frames load
	const pendingNavigationRef = useRef<Date | null>(null);

	// Seeking state for UX feedback when navigating from search
	const [seekingTimestamp, setSeekingTimestamp] = useState<string | null>(null);

	// Re-show audio transcript when navigating timeline
	useEffect(() => {
		setShowAudioTranscript(true);
	}, [currentIndex]);

	const { currentDate, setCurrentDate, fetchTimeRange, hasDateBeenFetched, loadingProgress, onWindowFocus, newFramesCount, lastFlushTimestamp, clearNewFramesCount } =
		useTimelineStore();

	const { frames, isLoading, error, message, fetchNextDayData, websocket } =
		useTimelineData(currentDate, (frame) => {
			setCurrentFrame(frame);
		});

	// Track if user is at "live edge" (viewing newest frame, index 0)
	const isAtLiveEdge = currentIndex === 0;
	const prevFramesLengthRef = useRef(frames.length);

	// When new frames arrive and user is NOT at live edge, adjust index to stay on same frame
	useEffect(() => {
		if (newFramesCount > 0 && !isAtLiveEdge && frames.length > prevFramesLengthRef.current) {
			// New frames were added at the front, shift our index to compensate
			setCurrentIndex(prev => prev + newFramesCount);
			console.log(`Adjusted index by +${newFramesCount} to stay on same frame (live edge: ${isAtLiveEdge})`);
		}
		prevFramesLengthRef.current = frames.length;

		// Clear the count after handling
		if (newFramesCount > 0) {
			clearNewFramesCount();
		}
	}, [lastFlushTimestamp, newFramesCount, isAtLiveEdge, frames.length, clearNewFramesCount]);

	// Listen for window focus events to refresh timeline data
	useEffect(() => {
		const unlisten = listen<boolean>("window-focused", (event) => {
			if (event.payload) {
				// Window gained focus - refresh timeline data
				console.log("Window focused, refreshing timeline...");
				onWindowFocus();
			}
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [onWindowFocus]);

	// Hide timeline when mouse moves to a different screen
	useEffect(() => {
		let initialScreenBounds: { x: number; y: number; width: number; height: number } | null = null;
		let checkInterval: ReturnType<typeof setInterval> | null = null;

		const initScreenBounds = async () => {
			try {
				const { currentMonitor, cursorPosition } = await import("@tauri-apps/api/window");
				const { getCurrentWindow } = await import("@tauri-apps/api/window");

				const window = getCurrentWindow();
				const monitor = await currentMonitor();

				if (monitor) {
					initialScreenBounds = {
						x: monitor.position.x,
						y: monitor.position.y,
						width: monitor.size.width,
						height: monitor.size.height,
					};

					// Check cursor position periodically
					checkInterval = setInterval(async () => {
						if (!initialScreenBounds) return;

						try {
							const cursor = await cursorPosition();
							const isOutside =
								cursor.x < initialScreenBounds.x ||
								cursor.x >= initialScreenBounds.x + initialScreenBounds.width ||
								cursor.y < initialScreenBounds.y ||
								cursor.y >= initialScreenBounds.y + initialScreenBounds.height;

							if (isOutside) {
								console.log("Cursor left screen, hiding timeline");
								commands.closeWindow("Main");
							}
						} catch (e) {
							// Ignore errors (window might be closing)
						}
					}, 500); // Check every 500ms
				}
			} catch (e) {
				console.warn("Failed to init screen bounds check:", e);
			}
		};

		initScreenBounds();

		return () => {
			if (checkInterval) {
				clearInterval(checkInterval);
			}
		};
	}, []);

	// Listen for navigate-to-timestamp events from search window
	useEffect(() => {
		const unlisten = listen<string>("navigate-to-timestamp", async (event) => {
			const targetTimestamp = event.payload;
			console.log("Navigating to timestamp:", targetTimestamp);

			const targetDate = new Date(targetTimestamp);

			// Show seeking overlay
			setSeekingTimestamp(targetTimestamp);

			// Store the pending navigation target - will be processed by the frames effect
			pendingNavigationRef.current = targetDate;

			// Navigate to the correct date if needed (this triggers frame fetch)
			if (!isSameDay(targetDate, currentDate)) {
				await handleDateChange(targetDate);
			}
			// Note: We don't call jumpToTime here even if on same date.
			// The frames effect below handles all cases to avoid stale closure issues.
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [currentDate]);

	// Process pending navigation when frames load after date change
	useEffect(() => {
		if (pendingNavigationRef.current && frames.length > 0) {
			const targetDate = pendingNavigationRef.current;
			// Only jump if we're on the correct date AND frames for that day have loaded
			// Check that at least one frame is from the target date
			const hasFramesForTargetDate = frames.some(frame =>
				isSameDay(new Date(frame.timestamp), targetDate)
			);
			if (isSameDay(targetDate, currentDate) && hasFramesForTargetDate) {
				console.log("Frames loaded, jumping to pending navigation:", targetDate);
				jumpToTime(targetDate);
				pendingNavigationRef.current = null;
				// Clear seeking overlay
				setSeekingTimestamp(null);
			}
		}
	}, [frames, currentDate]);

	// Progressive loading: show UI immediately once we have any frames
	const hasInitialFrames = frames.length > 0;
	const showBlockingLoader = isLoading && !hasInitialFrames;


	// Auto-select first frame when frames arrive and no frame is selected
	useEffect(() => {
		if (!currentFrame && frames.length > 0) {
			setCurrentFrame(frames[0]);
			setCurrentIndex(0);
		}
	}, [frames.length, currentFrame, setCurrentFrame]);

	// Track timeline opened
	useEffect(() => {
		posthog.capture("timeline_opened");
	}, []);

	useEffect(() => {
		const getStartDateAndSet = async () => {
			const data = await getStartDate();
			if (!("error" in data)) {
				setStartAndEndDates((prev) => ({
					...prev,
					start: data,
				}));
			}
		};

		getStartDateAndSet();
	}, []);

	useEffect(() => {
		// Wait for websocket to be ready before fetching
		if (!websocket || websocket.readyState !== WebSocket.OPEN) {
			return;
		}

		let currentDateEffect = new Date(currentDate);
		const checkIfThereAreFrames = async () => {
			const checkFramesForDate = await hasFramesForDate(currentDateEffect);
			console.log("checkFramesForDate", currentDateEffect, checkFramesForDate);
			if (!checkFramesForDate) {
				setCurrentDate(subDays(currentDateEffect, 1));
			}

			const startTime = new Date(currentDateEffect);
			startTime.setHours(0, 0, 0, 0);

			const endTime = new Date(currentDateEffect);
			if (endTime.getDate() === new Date().getDate()) {
				// For today: use current time so server can poll for real-time frames
				// Don't subtract 5 minutes - this was breaking live polling
				// (server checks if now <= end_time, which was always false)
			} else {
				endTime.setHours(23, 59, 59, 999);
			}
			fetchTimeRange(startTime, endTime);
		}
		checkIfThereAreFrames();
	}, [currentDate, websocket]); // Re-run when websocket connects or date changes

	// Sync currentDate to frame's date - but NOT during intentional navigation
	// This effect helps when scrolling across day boundaries, but must not fight
	// with explicit day changes from the controls
	useEffect(() => {
		// Skip if we're in the middle of intentional navigation
		if (isNavigatingRef.current) {
			return;
		}
		if (currentFrame) {
			const frameDate = new Date(currentFrame.timestamp);
			if (!isSameDay(frameDate, currentDate)) {
				setCurrentDate(frameDate);
			}
		}
	}, [currentFrame, currentDate]);

	const handleScroll = useMemo(
		() =>
			throttle(
				(e: WheelEvent) => {
					// Move these checks outside the throttle to improve performance
					const isWithinAiPanel =
						e.target instanceof Node &&
						document.querySelector(".ai-panel")?.contains(e.target);
					const isWithinAudioPanel =
						e.target instanceof Node &&
						document
							.querySelector(".audio-transcript-panel")
							?.contains(e.target);
					const isWithinTimelineDialog =
						e.target instanceof Node &&
						document.querySelector('[role="dialog"]')?.contains(e.target);

					if (isWithinAiPanel || isWithinAudioPanel || isWithinTimelineDialog) {
						return;
					}

					e.preventDefault();
					e.stopPropagation();

					// Calculate scroll intensity based on absolute delta
					const scrollIntensity = Math.abs(e.deltaY);
					const direction = -Math.sign(e.deltaY);

					// Change this if you want limit the index change
					const limitIndexChange = Infinity;

					// Adjust index change based on scroll intensity
					const indexChange =
						direction *
						Math.min(
							limitIndexChange,
							Math.ceil(Math.pow(scrollIntensity / 50, 1.5)),
						);

					requestAnimationFrame(() => {
						setCurrentIndex((prevIndex) => {
							const newIndex = Math.min(
								Math.max(0, Math.floor(prevIndex + indexChange)),
								frames.length - 1,
							);

							if (newIndex !== prevIndex && frames[newIndex]) {
								setCurrentFrame(frames[newIndex]);
							}

							return newIndex;
						});
					});
				},
				16,
				{ leading: true, trailing: false },
			),
		[frames], // Only depend on frames length changes
	);

	useEffect(() => {
		const preventScroll = (e: WheelEvent) => {
			const isWithinAiPanel = document
				.querySelector(".ai-panel")
				?.contains(e.target as Node);
			const isWithinAudioPanel = document
				.querySelector(".audio-transcript-panel")
				?.contains(e.target as Node);
			const isWithinTimelineDialog = document
				.querySelector('[role="dialog"]')
				?.contains(e.target as Node);
			const isWithinSettingsDialog = document
				.querySelector('[data-settings-dialog]')
				?.contains(e.target as Node);

			if (!isWithinAiPanel && !isWithinAudioPanel && !isWithinTimelineDialog && !isWithinSettingsDialog) {
				e.preventDefault();
			}
		};

		document.addEventListener("wheel", preventScroll, { passive: false });
		return () => document.removeEventListener("wheel", preventScroll);
	}, []);

	const handleRefresh = useCallback(() => {
		// Full page reload - simpler and more reliable than WebSocket reconnection
		window.location.reload();
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			container.addEventListener("wheel", handleScroll, { passive: false });
		}

		return () => {
			if (container) {
				container.removeEventListener("wheel", handleScroll);
			}
		};
	}, [handleScroll]);

	const jumpToTime = (targetDate: Date) => {
		// Find the closest frame to the target date
		if (frames.length === 0) return;

		const targetTime = targetDate.getTime();
		let closestIndex = 0;
		let closestDiff = Infinity;

		frames.forEach((frame, index) => {
			const frameTime = new Date(frame.timestamp).getTime();
			const diff = Math.abs(frameTime - targetTime);
			if (diff < closestDiff) {
				closestDiff = diff;
				closestIndex = index;
			}
		});

		// Update cursor position
		setCurrentIndex(closestIndex);
		if (frames[closestIndex]) {
			setCurrentFrame(frames[closestIndex]);
			//	setCurrentDate(new Date(frames[closestIndex].timestamp));
		}
	};

	const handleDateChange = async (newDate: Date) => {
		// Set navigation flag to prevent frame-date sync from fighting
		isNavigatingRef.current = true;

		try {
			const checkFramesForDate = await hasFramesForDate(newDate);

			if (!checkFramesForDate) {
				let subDate;
				if (isAfter(currentDate, newDate)) {
					subDate = subDays(newDate, 1);
				} else {
					subDate = addDays(newDate, 1);
				}

				// Limit recursion - don't go past start date
				if (isAfter(startAndEndDates.start, subDate)) {
					console.log("Reached start date boundary, stopping navigation");
					return;
				}

				return await handleDateChange(subDate);
			}

			// Already on this day
			if (isSameDay(newDate, currentDate)) {
				return;
			}

			// Don't go before start date
			if (isAfter(startAndEndDates.start, newDate)) {
				return;
			}

			// Track date change
			posthog.capture("timeline_date_changed", {
				from_date: currentDate.toISOString(),
				to_date: newDate.toISOString(),
			});

			// Store pending navigation - will be processed when frames are available
			pendingNavigationRef.current = newDate;

			// Clear frame first to prevent sync effect from reverting
			setCurrentFrame(null);
			setCurrentDate(newDate);

			// Find and jump to first frame of target date (frames are sorted newest-first)
			const targetDayStart = startOfDay(newDate);
			const targetDayEnd = endOfDay(newDate);

			// Find first frame that falls within the target date
			const targetIndex = frames.findIndex((frame) => {
				const frameDate = new Date(frame.timestamp);
				return frameDate >= targetDayStart && frameDate <= targetDayEnd;
			});

			if (targetIndex !== -1) {
				setCurrentIndex(targetIndex);
				setCurrentFrame(frames[targetIndex]);
				pendingNavigationRef.current = null; // Clear pending since we found it
			} else {
				// Frames not loaded yet - will be handled by pendingNavigation effect
				setCurrentIndex(0);
			}
		} finally {
			// Clear navigation flag after a short delay to let state settle
			setTimeout(() => {
				isNavigatingRef.current = false;
			}, 500);
		}
	};

	const handleJumpToday = useCallback(async () => {
		const today = new Date();

		// Set navigation flag to prevent frame-date sync from fighting
		isNavigatingRef.current = true;

		try {
			// Clear current state
			setCurrentFrame(null);
			setCurrentIndex(0);
			setCurrentDate(today);
		} finally {
			// Clear navigation flag after state settles
			setTimeout(() => {
				isNavigatingRef.current = false;
			}, 500);
		}
	}, [setCurrentFrame, setCurrentDate]);

	const animateToIndex = (targetIndex: number, duration: number = 1000) => {
		const startIndex = currentIndex;
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Apply easing
			const easedProgress = easeOutCubic(progress);

			// Calculate the current position
			const newIndex = Math.round(
				startIndex + (targetIndex - startIndex) * easedProgress,
			);

			// Update the frame
			setCurrentIndex(newIndex);
			if (frames[newIndex]) {
				setCurrentFrame(frames[newIndex]);
			}

			// Continue animation if not complete
			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		requestAnimationFrame(animate);
	};

	return (
		<TimelineProvider>
			<div
				ref={containerRef}
				className="inset-0 flex flex-col text-foreground relative"
				style={{
					height: "100vh",
					overscrollBehavior: "none",
					WebkitUserSelect: "none",
					userSelect: "none",
					MozUserSelect: "none",
					msUserSelect: "none",
				}}
			>
				{/* Main Image - Full Screen - Should fill entire viewport */}
				<div className="absolute inset-0 z-10">
					{currentFrame ? (
						<CurrentFrameTimeline
							currentFrame={currentFrame}
							onNavigate={(direction) => {
								const newIndex = direction === "next"
									? Math.min(currentIndex + 1, frames.length - 1)
									: Math.max(currentIndex - 1, 0);
								setCurrentIndex(newIndex);
								if (frames[newIndex]) {
									setCurrentFrame(frames[newIndex]);
								}
							}}
							canNavigatePrev={currentIndex > 0}
							canNavigateNext={currentIndex < frames.length - 1}
						/>
					) : !showBlockingLoader && !error && frames.length === 0 && !isLoading ? (
						<div className="absolute inset-0 flex items-center justify-center bg-background/90">
							<div className="text-center text-foreground p-8">
								<h3 className="text-lg font-medium mb-2">No Frame Available</h3>
								<p className="text-sm text-muted-foreground">
									No frames found for this date
								</p>
							</div>
						</div>
					) : null}
				</div>

				{/* Top Gradient Overlay - Very subtle */}
				<div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/20 via-black/5 to-transparent z-30 pointer-events-none" />

				{/* Bottom Gradient Overlay - Very subtle, only where timeline is */}
				<div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/10 via-black/2 to-transparent z-30 pointer-events-none" />

				{/* Top Controls */}
				<div className="absolute top-0 left-0 right-0 z-40 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
					<TimelineControls
						currentDate={currentDate}
						startAndEndDates={startAndEndDates}
						onDateChange={handleDateChange}
						onJumpToday={handleJumpToday}
					/>
					{/* Refresh button - top right */}
					<button
						onClick={handleRefresh}
						className="absolute top-[calc(env(safe-area-inset-top)+16px)] right-4 p-2 bg-background/80 hover:bg-background border border-border rounded-md transition-colors"
						title="Refresh timeline"
					>
						<RotateCcw className="w-4 h-4 text-muted-foreground" />
					</button>
				</div>

				{/* Loading/Error States - Progressive loading: only block when no frames yet */}
				{showBlockingLoader && (
					<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
						{/* Close button - always visible to prevent being stuck */}
						<button
							onClick={() => commands.closeWindow("Main")}
							className="absolute top-4 right-4 p-2 bg-card hover:bg-muted border border-border rounded-md transition-colors z-50"
							title="Close (Esc)"
						>
							<X className="w-4 h-4 text-muted-foreground" />
						</button>
						<div className="bg-card text-foreground p-6 rounded-2xl text-center space-y-3 max-w-md mx-4">
							<h3 className="font-medium">Loading Timeline</h3>
							<p className="text-sm text-foreground">
								Fetching your recorded frames...
							</p>
							<Loader2 className="h-5 w-5 animate-spin mx-auto mt-2" />
							<p className="text-xs text-muted-foreground mt-4">
								Press Esc or click X to close
							</p>
						</div>
					</div>
				)}

				{/* Non-blocking streaming indicator - shows when frames are loading in background */}
				{loadingProgress.isStreaming && hasInitialFrames && (
					<div className="absolute top-20 left-1/2 -translate-x-1/2 z-45 pointer-events-none">
						<div className="bg-card/80 backdrop-blur-sm text-foreground px-4 py-2 rounded-full text-sm flex items-center gap-2 border border-border shadow-lg">
							<Loader2 className="h-3 w-3 animate-spin" />
							<span>Loading frames... {loadingProgress.loaded.toLocaleString()}</span>
						</div>
					</div>
				)}

				{/* Seeking overlay - shows when navigating from search */}
				{seekingTimestamp && (
					<div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
						<div className="bg-card/95 backdrop-blur-md text-foreground px-6 py-4 rounded-xl text-center space-y-2 border border-border shadow-2xl">
							<div className="flex items-center justify-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="font-medium">Finding frame...</span>
							</div>
							<p className="text-xs text-muted-foreground font-mono">
								{new Date(seekingTimestamp).toLocaleString()}
							</p>
						</div>
					</div>
				)}

				{error && (
					<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
						{/* Close button - always visible to prevent being stuck */}
						<button
							onClick={() => commands.closeWindow("Main")}
							className="absolute top-4 right-4 p-2 bg-card hover:bg-muted border border-border rounded-md transition-colors z-50"
							title="Close (Esc)"
						>
							<X className="w-4 h-4 text-muted-foreground" />
						</button>
						<div className="bg-destructive/20 border border-destructive/30 text-foreground p-6 rounded-2xl text-center space-y-4 max-w-md mx-4">
							<div className="flex flex-col items-center gap-2">
								<AlertCircle className="h-6 w-6 text-destructive" />
								<h3 className="font-medium text-destructive">Connection Error</h3>
							</div>
							<p className="text-sm text-foreground">
								Unable to reach your screenpipe data. Please verify that the
								screenpipe turned on.
							</p>
							<button
								onClick={handleRefresh}
								className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border border-border mx-auto bg-muted"
							>
								<RotateCcw className="h-4 w-4" />
								<span>Reload Timeline</span>
							</button>
							<p className="text-xs text-muted-foreground">
								Press Esc or click X to close
							</p>
						</div>
					</div>
				)}

				{/* Audio Transcript Panel - Re-enabled and properly positioned */}
				{currentFrame && showAudioTranscript && (
					<div className="absolute bottom-28 left-4 right-4 z-35">
						<AudioTranscript
							frames={frames}
							currentIndex={currentIndex}
							groupingWindowMs={30000} // 30 seconds window
							onClose={() => setShowAudioTranscript(false)}
						/>
					</div>
				)}

					{/* Bottom Timeline - Overlay that doesn't cut off image */}
				<div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-auto">
					{frames.length > 0 ? (
						<TimelineSlider
							frames={frames}
							currentIndex={currentIndex}
							onFrameChange={(index) => {
								setCurrentIndex(index);
								if (frames[index]) {
									setCurrentFrame(frames[index]);
								}
							}}
							fetchNextDayData={fetchNextDayData}
							currentDate={currentDate}
							startAndEndDates={startAndEndDates}
							newFramesCount={newFramesCount}
							lastFlushTimestamp={lastFlushTimestamp}
						/>
					) : (
						<div className="bg-card/80 backdrop-blur-sm p-4 border-t border-border">
							<div className="text-foreground text-sm">
								{isLoading ? (
									<div className="space-y-3">
										{/* Skeleton timeline slider */}
										<div className="flex items-center gap-2 justify-center">
											<Loader2 className="w-4 h-4 animate-spin" />
											<span>Loading timeline...</span>
										</div>
										<div className="h-16 bg-muted/50 rounded-lg animate-pulse flex items-end gap-0.5 px-2 pb-2">
											{/* Skeleton bars */}
											{Array.from({ length: 60 }).map((_, i) => (
												<div
													key={i}
													className="flex-1 bg-muted rounded-t"
													style={{
														height: `${Math.random() * 60 + 20}%`,
														animationDelay: `${i * 20}ms`
													}}
												/>
											))}
										</div>
									</div>
								) : error ? (
									<div className="text-destructive text-center">Failed to load timeline data</div>
								) : (
									<div className="text-center">No timeline data available for this date</div>
								)}
							</div>
						</div>
					)}
				</div>

				{/* Scroll Indicator */}
				<div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 font-mono">
					<div className="flex flex-col border border-border bg-background">
						<button
							className="flex items-center justify-center w-8 h-8 border-b border-border text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
							onClick={() => window.scrollBy({ top: -200, behavior: 'smooth' })}
							aria-label="Scroll up"
						>
							▲
						</button>
						<button
							className="flex items-center justify-center w-8 h-8 text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
							onClick={() => window.scrollBy({ top: 200, behavior: 'smooth' })}
							aria-label="Scroll down"
						>
							▼
						</button>
					</div>
				</div>
			</div>
		</TimelineProvider>
	);
}
