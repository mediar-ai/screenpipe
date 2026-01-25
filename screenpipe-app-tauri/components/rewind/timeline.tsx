"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Loader2, RotateCcw, AlertCircle, X } from "lucide-react";
import { AudioTranscript } from "@/components/rewind/timeline/audio-transcript";
import { TimelineProvider } from "@/lib/hooks/use-timeline-selection";
import { throttle } from "lodash";
import { TimelineControls } from "@/components/rewind/timeline/timeline-controls";
import { addDays, isAfter, isSameDay, subDays } from "date-fns";
import { getStartDate } from "@/lib/actions/get-start-date";
import { useTimelineData } from "@/lib/hooks/use-timeline-data";
import { useCurrentFrame } from "@/lib/hooks/use-current-frame";
import { TimelineSlider } from "@/components/rewind/timeline/timeline";
import { useTimelineStore } from "@/lib/hooks/use-timeline-store";
import { hasFramesForDate } from "@/lib/actions/has-frames-date";
import { CommandShortcut } from "@/components/ui/command";
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

	// Re-show audio transcript when navigating timeline
	useEffect(() => {
		setShowAudioTranscript(true);
	}, [currentIndex]);

	const { currentDate, setCurrentDate, fetchTimeRange, hasDateBeenFetched, loadingProgress } =
		useTimelineStore();

	const { frames, isLoading, error, message, fetchNextDayData, websocket } =
		useTimelineData(currentDate, (frame) => {
			setCurrentFrame(frame);
		});

	// Progressive loading: show UI immediately once we have any frames
	const hasInitialFrames = frames.length > 0;
	const showBlockingLoader = isLoading && !hasInitialFrames;

	// Message timeout and dismiss state
	const [messageShownAt, setMessageShownAt] = useState<number | null>(null);
	const [canDismissMessage, setCanDismissMessage] = useState(false);
	const [messageDismissed, setMessageDismissed] = useState(false);
	const MESSAGE_DISMISS_DELAY = 3000; // Show dismiss button after 3 seconds
	const MESSAGE_AUTO_TIMEOUT = 15000; // Auto-dismiss after 15 seconds if no frames

	// Track when message appears
	useEffect(() => {
		if (message && !messageShownAt) {
			setMessageShownAt(Date.now());
			setCanDismissMessage(false);
			setMessageDismissed(false);
		} else if (!message) {
			setMessageShownAt(null);
			setCanDismissMessage(false);
			setMessageDismissed(false);
		}
	}, [message, messageShownAt]);

	// Enable dismiss button after delay
	useEffect(() => {
		if (messageShownAt && !canDismissMessage) {
			const timer = setTimeout(() => {
				setCanDismissMessage(true);
			}, MESSAGE_DISMISS_DELAY);
			return () => clearTimeout(timer);
		}
	}, [messageShownAt, canDismissMessage]);

	// Auto-dismiss message after timeout if no frames arrived
	useEffect(() => {
		if (messageShownAt && !hasInitialFrames) {
			const timer = setTimeout(() => {
				setMessageDismissed(true);
			}, MESSAGE_AUTO_TIMEOUT);
			return () => clearTimeout(timer);
		}
	}, [messageShownAt, hasInitialFrames]);

	// Clear message dismissed state when frames arrive
	useEffect(() => {
		if (hasInitialFrames && messageDismissed) {
			setMessageDismissed(false);
		}
	}, [hasInitialFrames, messageDismissed]);

	const handleDismissMessage = useCallback(() => {
		setMessageDismissed(true);
	}, []);

	// Show message only if not dismissed
	const shouldShowMessage = message && !messageDismissed && !hasInitialFrames;

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

	useEffect(() => {
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

	const handleRefresh = () => {
		window.location.reload();
	};

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
		const checkFramesForDate = await hasFramesForDate(newDate);

		if (!checkFramesForDate) {
			let subDate;
			if (isAfter(currentDate, newDate)) {
				subDate = subDays(newDate, 1);
			} else {
				subDate = addDays(newDate, 1);
			}

			return await handleDateChange(subDate);
		}

		if (!hasDateBeenFetched(newDate)) {
			setCurrentFrame(null);
			const frameTimeStamp = new Date(newDate);
			console.log(
				frameTimeStamp.getDate() === new Date(currentDate).getDate(),
				startAndEndDates.start.getDate(),
				newDate.getDate(),
			);
			if (isSameDay(frameTimeStamp, new Date(currentDate))) {
				return;
			}

			if (isAfter(startAndEndDates.start, newDate)) {
				return;
			}

			// Track date change
			posthog.capture("timeline_date_changed", {
				from_date: currentDate.toISOString(),
				to_date: newDate.toISOString(),
			});

			setCurrentDate(newDate);
		} else {
			jumpToTime(newDate);
		}
	};

	const handleJumpToday = () => {
		window.location.reload();
	};

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
				<div className="absolute top-0 left-0 right-0 z-40 p-4">
					<TimelineControls
						currentDate={currentDate}
						startAndEndDates={startAndEndDates}
						onDateChange={handleDateChange}
						onJumpToday={handleJumpToday}
					/>
				</div>

				{/* Loading/Error States - Progressive loading: only block when no frames yet */}
				{showBlockingLoader && (
					<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
						<div className="bg-card text-foreground p-6 rounded-2xl text-center space-y-3 max-w-md mx-4">
							<h3 className="font-medium">Loading Timeline</h3>
							<p className="text-sm text-foreground">
								Fetching your recorded frames...
							</p>
							<Loader2 className="h-5 w-5 animate-spin mx-auto mt-2" />
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

				{!error && shouldShowMessage && (
					<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
						<div className="bg-card text-foreground p-6 border border-border rounded-2xl shadow-2xl text-center space-y-3 max-w-md mx-4 relative">
							{/* Dismiss button - appears after delay */}
							{canDismissMessage && (
								<button
									onClick={handleDismissMessage}
									className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
									title="Dismiss"
								>
									<X className="h-4 w-4" />
								</button>
							)}

							<h3 className="font-medium">
								{message.includes("connecting") ? "Starting Up" : "Processing"}
							</h3>
							<p className="text-sm text-foreground">
								{message}
							</p>
							<Loader2 className="h-5 w-5 animate-spin mx-auto mt-2" />

							{/* Progress hint after delay */}
							{canDismissMessage && (
								<p className="text-xs text-muted-foreground mt-3 animate-in fade-in duration-300">
									Taking longer than expected? You can dismiss this and continue.
								</p>
							)}
						</div>
					</div>
				)}

				{error && (
					<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
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

