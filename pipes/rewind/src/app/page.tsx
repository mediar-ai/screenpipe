"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { TimelineIconsSection } from "@/components/timeline/timeline-dock-section";
import { AudioTranscript } from "@/components/timeline/audio-transcript";
import { AIPanel } from "@/components/timeline/ai-panel";
import { TimelineProvider } from "@/lib/hooks/use-timeline-selection";
import { throttle } from "lodash";
import { AGENTS } from "@/components/timeline/agents";
import { TimelineSelection } from "@/components/timeline/timeline-selection";
import { TimelineControls } from "@/components/timeline/timeline-controls";
import { TimelineSearch } from "@/components/timeline/timeline-search";
import { TimelineSearch2 } from "@/components/timeline/timeline-search-v2";
import { isAfter, isSameDay } from "date-fns";
import { getStartDate } from "@/lib/actions/get-start-date";
import { useTimelineData } from "@/lib/hooks/use-timeline-data";
import { useCurrentFrame } from "@/lib/hooks/use-current-frame";
import { TimelineSlider } from "@/components/timeline/timeline";
import { useTimelineStore } from "@/lib/hooks/use-timeline-store";

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

function getTimeArray(
	timeObj: TimeRange | null | undefined,
	count: number = 7,
): string[] {
	if (!timeObj) return [];
	const start = new Date(timeObj.start);
	const end = new Date(timeObj.end);
	const totalDuration = end.getTime() - start.getTime();
	const interval = totalDuration / (count - 1);

	return Array.from({ length: count }, (_, i) => {
		const timestamp = new Date(start.getTime() + i * interval);
		return timestamp.toISOString();
	});
}

// Add this easing function at the top level
const easeOutCubic = (x: number): number => {
	return 1 - Math.pow(1 - x, 3);
};

export default function Timeline() {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isAiPanelExpanded, setIsAiPanelExpanded] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [aiPanelPosition, setAiPanelPosition] = useState({ x: 0, y: 0 });
	// const [searchResults, setSearchResults] = useState<number[]>([]);
	const [startAndEndDates, setStartAndEndDates] = useState<TimeRange>({
		start: new Date(new Date().setHours(0, 0, 0, 0)),
		end: new Date(),
	});

	const { currentFrame, setCurrentFrame, imageFrame } = useCurrentFrame(
		(index) => {
			setCurrentIndex(index);
		},
	);

	const { currentDate, setCurrentDate, fetchTimeRange, hasDateBeenFetched } =
		useTimelineStore();

	const { frames, isLoading, error, message, fetchNextDayData } =
		useTimelineData(currentDate, (frame) => {
			setCurrentFrame(frame);
		});

	useEffect(() => {
		setAiPanelPosition({
			x: window.innerWidth - 400,
			y: window.innerHeight / 4,
		});
	}, []);

	useEffect(() => {
		const getStartEndDates = async () => {
			const data = await getStartDate();

			if ("error" in data) {
				return;
			}

			setStartAndEndDates((prev) => ({
				...prev,
				start: data,
			}));
		};

		getStartEndDates();
	}, []);

	useEffect(() => {
		const startTime = new Date(currentDate);
		startTime.setHours(0, 0, 0, 0);

		const endTime = new Date(currentDate);
		if (endTime.getDate() === new Date().getDate()) {
			endTime.setMinutes(endTime.getMinutes() - 5);
		} else {
			endTime.setHours(23, 59, 59, 999);
		}
		fetchTimeRange(startTime, endTime);
	}, [currentDate]);

	//useEffect(() => {
	//	setCurrentFrame(null);
	//	setCurrentIndex(0);
	//}, [currentDate]);

	useEffect(() => {
		if (currentFrame) {
			const frameDate = new Date(currentFrame.timestamp);
			console.log(frameDate, currentDate);
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
					const direction = Math.sign(e.deltaY);

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

	//	const timePercentage = useMemo(() => {
	//		if (!frames.length || currentIndex >= frames.length || !loadedTimeRange) {
	//			return 0;
	//		}
	//
	//		const currentFrame = frames[currentIndex];
	//		if (!currentFrame?.timestamp) {
	//			return 0;
	//		}
	//
	//		const frameTime = new Date(currentFrame.timestamp);
	//		const totalVisibleMilliseconds =
	//			loadedTimeRange.end.getTime() - loadedTimeRange.start.getTime();
	//		const currentMilliseconds =
	//			frameTime.getTime() - loadedTimeRange.start.getTime();
	//
	//		const percentage = Math.min(
	//			99.8,
	//			(currentMilliseconds / totalVisibleMilliseconds) * 100,
	//		);
	//		return Boolean(percentage) ? percentage : 0;
	//	}, [currentIndex, frames, loadedTimeRange]);

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

			if (!isWithinAiPanel && !isWithinAudioPanel && !isWithinTimelineDialog) {
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

	const handleDateChange = (newDate: Date) => {
		console.log(hasDateBeenFetched(newDate));
		if (!hasDateBeenFetched(newDate)) {
			setCurrentFrame(null);
			const frameTimeStamp = new Date(newDate);
			if (frameTimeStamp.getDate() === new Date(currentDate).getDate()) {
				return;
			}

			if (isAfter(startAndEndDates.start.getDate(), newDate.getDate())) {
				return;
			}

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

	//	const timeRange = useMemo(
	//		() => getTimeArray(loadedTimeRange),
	//		[loadedTimeRange],
	//	);

	return (
		<TimelineProvider>
			<div
				ref={containerRef}
				className="inset-0 flex flex-col bg-background text-foreground relative"
				style={{
					height: "100vh",
					overscrollBehavior: "none",
					WebkitUserSelect: "none",
					userSelect: "none",
					MozUserSelect: "none",
					msUserSelect: "none",
				}}
			>
				<div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
					<div className="flex items-center gap-4">
						<TimelineControls
							currentDate={currentDate}
							startAndEndDates={startAndEndDates}
							onDateChange={handleDateChange}
							onJumpToday={handleJumpToday}
							className="shadow-lg"
						/>
						{/* <TimelineSearch2
              frames={frames}
              onResultSelect={animateToIndex}
              onSearchResults={setSearchResults}
            /> */}
					</div>
				</div>

				<div className="flex-1 relative min-h-0">
					{isLoading && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="bg-background/90 p-5 border rounded-lg shadow-lg text-center">
								<p>loading frames...</p>
								<Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />
							</div>
						</div>
					)}
					{message && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="bg-background/90 p-5 border rounded-lg shadow-lg text-center">
								<p>{message}</p>
								<Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />
							</div>
						</div>
					)}
					{error && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="bg-destructive/10 p-5 border-destructive/20 border rounded-lg text-destructive flex flex-col items-center">
								<AlertCircle className="h-4 w-4 mb-2" />
								<p className="mb-4">
									i cannot reach your screenpipe data, did you enable the
									timeline feature?
								</p>
								<button
									onClick={handleRefresh}
									className="flex items-center gap-2 px-4 py-2 bg-background text-foreground hover:bg-muted transition-colors rounded-md border border-input"
								>
									<RotateCcw className="h-4 w-4" />
									reload
								</button>
							</div>
						</div>
					)}
					{currentFrame && (
						<img
							src={`data:image/png;base64,${imageFrame}`}
							className="absolute inset-0 w-4/5 h-auto max-h-[75vh] object-contain mx-auto border rounded-xl p-2 mt-20"
							alt="Current frame"
						/>
					)}
					{currentFrame && (
						<AudioTranscript
							frames={frames}
							currentIndex={currentIndex}
							groupingWindowMs={30000} // 30 seconds window
						/>
					)}
				</div>

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
				{
					//<div className="w-4/5 mx-auto my-8 relative select-none">
					//	<div
					//		className="h-[60px] bg-card border rounded-lg shadow-sm cursor-crosshair relative overflow-hidden"
					//		style={{
					//			width: "100%",
					//			boxSizing: "border-box",
					//		}}
					//	>
					//		{
					//			//                     loadedTimeRange && (
					//			//<TimelineSelection loadedTimeRange={loadedTimeRange} />
					//			//   )
					//			//<TimelineSlider frames={frames} />
					//		}
					//		<div
					//			className="absolute top-0 h-full w-1 bg-foreground/50 shadow-sm opacity-80 z-10"
					//			style={{ left: `${timePercentage}%`, zIndex: 100 }}
					//		>
					//			<div className="relative -top-6 right-3 z-50 text-[10px] text-muted-foreground whitespace-nowrap">
					//				{currentIndex < frames.length &&
					//					frames[currentIndex] &&
					//					frames[currentIndex].timestamp &&
					//					(() => {
					//						try {
					//							return new Date(
					//								frames[currentIndex].timestamp,
					//							).toLocaleTimeString(
					//								"en-US", // explicitly specify locale
					//								{
					//									hour: "2-digit",
					//									minute: "2-digit",
					//									second: "2-digit",
					//								},
					//							);
					//						} catch (e) {
					//							console.error("failed to format timestamp:", e);
					//							return frames[currentIndex].timestamp; // fallback to raw timestamp
					//						}
					//					})()}
					//			</div>
					//		</div>
					//		{searchResults.map((frameIndex) => {
					//			const percentage = (frameIndex / (frames.length - 1)) * 100;
					//			return (
					//				<div
					//					key={frameIndex}
					//					className="absolute top-0 h-full w-1.5 bg-blue-500/50 hover:bg-blue-500 cursor-pointer transition-colors"
					//					style={{ left: `${percentage}%`, zIndex: 4 }}
					//					onClick={() => {
					//						animateToIndex(frameIndex);
					//						setSearchResults([]); // Clear results after clicking
					//					}}
					//				>
					//					<div className="absolute -top-6 -left-2 text-[10px] text-blue-500 whitespace-nowrap">
					//						{new Date(frames[frameIndex].timestamp).toLocaleTimeString(
					//							[],
					//							{
					//								hour: "2-digit",
					//								minute: "2-digit",
					//							},
					//						)}
					//					</div>
					//				</div>
					//			);
					//		})}
					//	</div>
				}

				<AIPanel
					position={aiPanelPosition}
					onPositionChange={setAiPanelPosition}
					onClose={() => {
						setIsAiPanelExpanded(false);
					}}
					frames={frames}
					agents={AGENTS}
					isExpanded={isAiPanelExpanded}
					onExpandedChange={setIsAiPanelExpanded}
				/>
				{
					//	{loadedTimeRange && frames.length > 0 && (
					//		<TimelineIconsSection blocks={frames} timeRange={loadedTimeRange} />
					//	)}
					//
					//	<div className="relative mt-1 px-2 text-[10px] text-muted-foreground select-none">
					//		{timeRange.map((time, i) => {
					//			const dateTime = new Date(time);
					//			return (
					//				<button
					//					key={i}
					//					className="absolute transform -translate-x-1/2 text-nowrap flex flex-col"
					//					style={{
					//						left: `${(i * 100) / (timeRange.length - 1)}%`,
					//					}}
					//					onClick={() => jumpToTime(new Date(time))}
					//				>
					//					{dateTime.toLocaleTimeString("en-US", {
					//						hour: "numeric",
					//						minute: "2-digit",
					//						hour12: true,
					//					})}
					//				</button>
					//			);
					//		})}
					//	</div>
					//  </div>
				}

				<div className="fixed left-12 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					<div className="flex flex-col items-center gap-1">
						<span>▲</span>
						<span>scroll</span>
						<span>▼</span>
					</div>
				</div>
			</div>
		</TimelineProvider>
	);
}
