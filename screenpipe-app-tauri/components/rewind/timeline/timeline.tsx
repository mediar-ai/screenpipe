import { StreamTimeSeriesResponse, TimeRange } from "@/components/rewind/timeline";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { isAfter, subDays, format } from "date-fns";
import { motion, useScroll, useTransform } from "framer-motion";
import { ZoomIn, ZoomOut, Mic } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";

interface TimelineSliderProps {
	frames: StreamTimeSeriesResponse[];
	currentIndex: number;
	startAndEndDates: TimeRange;
	onFrameChange: (index: number) => void;
	fetchNextDayData: (date: Date) => void;
	currentDate: Date;
	onSelectionChange?: (selectedFrames: StreamTimeSeriesResponse[]) => void;
	newFramesCount?: number; // Number of new frames added (for animation)
	lastFlushTimestamp?: number; // When frames were last added (to trigger animation)
}

interface AppGroup {
	appName: string;
	frames: StreamTimeSeriesResponse[];
	color: string;
	iconSrc?: string;
}

export function stringToColor(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	let color = "#";
	for (let i = 0; i < 3; i++) {
		const value = (hash >> (i * 8)) & 0xff;
		color += ("00" + value.toString(16)).substr(-2);
	}
	return color;
}

// Get the app name from a frame, preferring devices with non-empty app names
export function getFrameAppName(frame: StreamTimeSeriesResponse | undefined): string {
	if (!frame?.devices?.length) return 'Unknown';
	// Find first device with a non-empty app_name
	const deviceWithApp = frame.devices.find(d => d.metadata?.app_name);
	return deviceWithApp?.metadata?.app_name || 'Unknown';
}

export const TimelineSlider = ({
	frames = [],
	currentIndex,
	onFrameChange,
	fetchNextDayData,
	startAndEndDates,
	currentDate,
	onSelectionChange,
	newFramesCount = 0,
	lastFlushTimestamp = 0,
}: TimelineSliderProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const observerTargetRef = useRef<HTMLDivElement>(null);
	const lastFetchRef = useRef<Date | null>(null);
	const { scrollXProgress } = useScroll({
		container: containerRef,
		offset: ["start end", "end start"],
	});
	const lineWidth = useTransform(scrollXProgress, [0, 1], ["0%", "100%"]);
	const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
	const [hasDragMoved, setHasDragMoved] = useState(false); // Track if mouse moved during drag
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const { setSelectionRange, selectionRange } = useTimelineSelection();

	// Zoom state: 1 = normal, >1 = zoomed in, <1 = zoomed out
	// Range: 0.25 (very zoomed out) to 4 (very zoomed in)
	const [zoomLevel, setZoomLevel] = useState(1);
	const [targetZoom, setTargetZoom] = useState(1);
	const MIN_ZOOM = 0.25;
	const MAX_ZOOM = 4;

	// Smooth zoom animation using requestAnimationFrame
	useEffect(() => {
		if (Math.abs(zoomLevel - targetZoom) < 0.01) {
			if (zoomLevel !== targetZoom) setZoomLevel(targetZoom);
			return;
		}

		const animationId = requestAnimationFrame(() => {
			// Ease toward target (lerp with 0.15 factor for smooth animation)
			setZoomLevel(prev => prev + (targetZoom - prev) * 0.15);
		});

		return () => cancelAnimationFrame(animationId);
	}, [zoomLevel, targetZoom]);

	// Track if we're in a zoom gesture to prevent simultaneous scrolling
	const isZoomingRef = useRef(false);
	const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Handle pinch-to-zoom (trackpad) and Cmd+Scroll (mouse)
	const handleWheel = useCallback((e: WheelEvent) => {
		// Pinch gesture on trackpad sends ctrlKey=true
		// Cmd+Scroll on mouse sends metaKey=true
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			e.stopPropagation();

			// Mark that we're zooming - this prevents scroll from happening
			isZoomingRef.current = true;
			if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
			zoomTimeoutRef.current = setTimeout(() => {
				isZoomingRef.current = false;
			}, 150); // Debounce - wait 150ms after last zoom event

			// Calculate zoom delta (negative deltaY = zoom in)
			const zoomDelta = -e.deltaY * 0.008;

			setTargetZoom((prev) => {
				const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * (1 + zoomDelta)));
				return newZoom;
			});
		} else if (!isZoomingRef.current) {
			// Only allow scroll when not in a zoom gesture
			// Regular scroll - speed scales inversely with zoom
			// When zoomed out (0.25), scroll moves 4x faster through frames
			// When zoomed in (4), scroll moves 0.25x slower
			const scrollMultiplier = 1 / zoomLevel;
			const framesToSkip = Math.round(e.deltaX * scrollMultiplier * 0.1);

			if (framesToSkip !== 0 && onFrameChange) {
				const newIndex = Math.max(0, Math.min(frames.length - 1, currentIndex - framesToSkip));
				if (newIndex !== currentIndex) {
					onFrameChange(newIndex);
				}
			}
		}
	}, [zoomLevel, currentIndex, frames.length, onFrameChange]);

	// Attach wheel event listener for zoom
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Use passive: false to allow preventDefault for pinch gestures
		container.addEventListener('wheel', handleWheel, { passive: false });

		return () => {
			container.removeEventListener('wheel', handleWheel);
		};
	}, [handleWheel]);

	// Auto-focus container on mount so zoom works immediately
	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			// Small delay to ensure DOM is ready
			requestAnimationFrame(() => {
				container.focus();
			});
		}
	}, []);

	// Calculate frame width based on zoom level
	const frameWidth = useMemo(() => {
		const baseWidth = 6; // 1.5 * 4 = 6px base (w-1.5 = 0.375rem = 6px)
		return Math.max(2, baseWidth * zoomLevel);
	}, [zoomLevel]);

	const frameMargin = useMemo(() => {
		const baseMargin = 2; // mx-0.5 = 0.125rem = 2px
		return Math.max(1, baseMargin * zoomLevel);
	}, [zoomLevel]);

	// Animation state for new frames pulse
	const [showNewFramesPulse, setShowNewFramesPulse] = useState(false);
	const prevFlushTimestampRef = useRef(lastFlushTimestamp);

	// Trigger pulse animation when new frames arrive
	useEffect(() => {
		if (lastFlushTimestamp > prevFlushTimestampRef.current && newFramesCount > 0) {
			setShowNewFramesPulse(true);
			const timer = setTimeout(() => setShowNewFramesPulse(false), 1500);
			prevFlushTimestampRef.current = lastFlushTimestamp;
			return () => clearTimeout(timer);
		}
		prevFlushTimestampRef.current = lastFlushTimestamp;
	}, [lastFlushTimestamp, newFramesCount]);

	// Pre-compute frame index map for O(1) lookups instead of O(n) indexOf
	// This reduces 2.68M comparisons per render to just 400 Map lookups
	const frameIndexMap = useMemo(() => {
		const map = new Map<string, number>();
		frames.forEach((frame, index) => {
			map.set(frame.timestamp, index);
		});
		return map;
	}, [frames]);

	// Adjust visible frames based on zoom - zoomed out shows more frames
	// Use a stable window size to prevent jumpy behavior
	const visibleFrames = useMemo(() => {
		if (!frames || frames.length === 0) return [];
		// Fixed window centered on current index - zoom affects frame SIZE, not count
		// This prevents jumpy behavior when zooming
		const visibleCount = 400; // Fixed window
		const start = Math.max(0, currentIndex - visibleCount);
		const end = Math.min(frames.length, currentIndex + visibleCount);
		return frames.slice(start, end);
	}, [frames, currentIndex]);

	const appGroups = useMemo(() => {
		if (!visibleFrames || visibleFrames.length === 0) return [];

		const groups: AppGroup[] = [];
		let currentApp = "";
		let currentGroup: StreamTimeSeriesResponse[] = [];

		visibleFrames.forEach((frame) => {
			const appName = getFrameAppName(frame);
			if (appName !== currentApp) {
				if (currentGroup.length > 0) {
					groups.push({
						appName: currentApp,
						frames: currentGroup,
						color: stringToColor(currentApp),
					});
				}
				currentApp = appName;
				currentGroup = [frame];
			} else {
				currentGroup.push(frame);
			}
		});

		if (currentGroup.length > 0) {
			groups.push({
				appName: currentApp,
				frames: currentGroup,
				color: stringToColor(currentApp),
			});
		}
		return groups;
	}, [visibleFrames]);

	// Compute time markers for the visible range
	const timeMarkers = useMemo(() => {
		if (!visibleFrames || visibleFrames.length === 0) return [];

		const markers: { time: string; position: number; isHour: boolean }[] = [];
		const seenHours = new Set<string>();

		visibleFrames.forEach((frame, index) => {
			const date = new Date(frame.timestamp);
			const hourKey = `${date.getHours()}`;
			const minuteKey = `${date.getHours()}:${Math.floor(date.getMinutes() / 15) * 15}`;

			// Add hour markers
			if (!seenHours.has(hourKey)) {
				seenHours.add(hourKey);
				markers.push({
					time: format(date, 'h a'),
					position: index,
					isHour: true,
				});
			}
		});

		return markers;
	}, [visibleFrames]);

	useEffect(() => {
		const observerTarget = observerTargetRef.current;
		if (!observerTarget) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry.isIntersecting) return;

				const lastDate = subDays(currentDate, 1);
				const now = new Date();
				const canFetch =
					!lastFetchRef.current ||
					now.getTime() - lastFetchRef.current.getTime() > 1000;

				if (isAfter(lastDate, startAndEndDates.start) && canFetch) {
					lastFetchRef.current = now;
					fetchNextDayData(lastDate);
				}
			},
			{
				root: containerRef.current,
				threshold: 1.0,
				rootMargin: "0px 20% 0px 0px",
			},
		);

		observer.observe(observerTarget);
		return () => observer.disconnect();
	}, [fetchNextDayData, currentDate, startAndEndDates]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !frames[currentIndex]) return;

		const currentTimestamp = frames[currentIndex].timestamp;
		const currentElement = container.querySelector(
			`[data-timestamp="${currentTimestamp}"]`,
		);

		if (!currentElement) return;

		currentElement.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}, [currentIndex, frames.length]);

	useEffect(() => {
		if (!selectionRange) {
			setSelectedIndices(new Set());
		}
	}, [selectionRange]);

	// Clear selection when user scrolls/navigates away from the selected range
	useEffect(() => {
		if (!selectionRange || selectedIndices.size === 0 || !frames.length) return;

		// Check if current frame is still within or near the selection
		const currentFrame = frames[currentIndex];
		if (!currentFrame) return;

		const currentTime = new Date(currentFrame.timestamp).getTime();
		const selectionStart = selectionRange.start.getTime();
		const selectionEnd = selectionRange.end.getTime();

		// Allow some buffer (30 seconds) outside selection before clearing
		const buffer = 30000;
		const isNearSelection =
			currentTime >= selectionStart - buffer &&
			currentTime <= selectionEnd + buffer;

		if (!isNearSelection) {
			setSelectionRange(null);
			setSelectedIndices(new Set());
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentIndex, frames.length]);

	const handleDragStart = (index: number) => {
		setIsDragging(true);
		setDragStartIndex(index);
		setHasDragMoved(false); // Reset movement tracking
		// Don't set selection immediately - wait for movement
	};

	const handleDragOver = (index: number) => {
		if (isDragging && dragStartIndex !== null && frames && frames.length > 0) {
			// Check if we've actually moved to a different frame
			if (index !== dragStartIndex) {
				setHasDragMoved(true); // Mark that mouse has moved during drag
			}

			// Only create selection if we've moved
			if (!hasDragMoved && index === dragStartIndex) {
				return; // No movement yet, don't create selection
			}

			const start = Math.min(dragStartIndex, index);
			const end = Math.max(dragStartIndex, index);
			const newSelection = new Set<number>();

			for (let i = start; i <= end; i++) {
				newSelection.add(i);
			}

			setSelectedIndices(newSelection);

			// Get frame IDs for the selection - add safety check
			const selectedFrameIds = Array.from(newSelection).map(
				(i) => frames[i]?.devices?.[0]?.frame_id || '',
			).filter(Boolean);

			// Update selection range with frame IDs
			setSelectionRange({
				end: new Date(frames[start]?.timestamp || Date.now()),
				start: new Date(frames[end]?.timestamp || Date.now()),
				frameIds: selectedFrameIds,
			});

			if (onSelectionChange) {
				const selectedFrames = Array.from(newSelection).map((i) => frames[i]).filter(Boolean);
				onSelectionChange(selectedFrames);
			}
		}
	};

	const handleDragEnd = () => {
		// If no movement during drag, this was a click - jump to that frame
		if (!hasDragMoved && dragStartIndex !== null) {
			onFrameChange(dragStartIndex);
			// Don't create selection for clicks
			setSelectedIndices(new Set());
			setSelectionRange(null);
		} else if (selectedIndices.size > 1) {
			// Track selection if multiple frames were selected
			posthog.capture("timeline_selection_made", {
				frames_selected: selectedIndices.size,
			});
		}
		setIsDragging(false);
		setDragStartIndex(null);
		setHasDragMoved(false);
	};

	// Calculate group width for positioning labels
	const getGroupWidth = useCallback((group: AppGroup) => {
		return group.frames.length * (frameWidth + frameMargin * 2);
	}, [frameWidth, frameMargin]);

	return (
		<div className="relative w-full" dir="rtl">
			<motion.div
				className="absolute top-0 h-1 bg-foreground/30"
				style={{ width: lineWidth }}
			/>
			{/* Zoom controls - floating on left side */}
			<div className="absolute left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 bg-background/80 backdrop-blur-sm border border-border rounded-lg p-1">
				<button
					onClick={() => setTargetZoom((prev) => Math.min(MAX_ZOOM, prev * 1.5))}
					className="p-1.5 hover:bg-foreground/10 rounded transition-colors"
					title="Zoom in (or pinch/Cmd+scroll)"
				>
					<ZoomIn className="w-4 h-4 text-foreground" />
				</button>
				<div className="text-[10px] text-center text-muted-foreground font-mono">
					{Math.round(targetZoom * 100)}%
				</div>
				<button
					onClick={() => setTargetZoom((prev) => Math.max(MIN_ZOOM, prev / 1.5))}
					className="p-1.5 hover:bg-foreground/10 rounded transition-colors"
					title="Zoom out (or pinch/Cmd+scroll)"
				>
					<ZoomOut className="w-4 h-4 text-foreground" />
				</button>
			</div>

			{/* New frames pulse indicator - appears on right side (newest) */}
			{showNewFramesPulse && (
				<motion.div
					className="absolute right-0 top-0 bottom-0 w-24 pointer-events-none z-20"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 1, 0] }}
					transition={{ duration: 1.5, ease: "easeOut" }}
				>
					<div className="h-full w-full bg-gradient-to-l from-foreground/30 via-foreground/15 to-transparent" />
					<motion.div
						className="absolute right-2 top-1/2 -translate-y-1/2 bg-foreground text-background text-xs font-medium px-2 py-1 rounded-full shadow-lg"
						initial={{ scale: 0, x: 20 }}
						animate={{ scale: 1, x: 0 }}
						exit={{ scale: 0, x: 20 }}
						transition={{ type: "spring", damping: 15 }}
					>
						+{newFramesCount} new
					</motion.div>
				</motion.div>
			)}
			<div
				ref={containerRef}
				tabIndex={0}
				className="w-full overflow-x-auto overflow-y-visible scrollbar-hide bg-gradient-to-t from-black/50 to-black/0 outline-none"
				style={{
					paddingTop: "60px", // Space for tooltips above
					paddingBottom: "24px", // Space for time axis below
				}}
			>
				<motion.div
					className="whitespace-nowrap flex flex-nowrap w-max justify-center px-[50vw] h-24 sticky right-0 scrollbar-hide relative"
					onMouseUp={handleDragEnd}
					onMouseLeave={handleDragEnd}
				>
					{appGroups.map((group, groupIndex) => {
						const groupWidth = getGroupWidth(group);
						const showLabel = groupWidth > 60; // Only show label if group is wide enough
						const showFullLabel = groupWidth > 100;

						return (
							<div
								key={`${group.appName}-${groupIndex}`}
								className="flex flex-nowrap items-end h-full group/appgroup relative"
								dir="rtl"
								style={{
									borderLeft: groupIndex > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
								}}
							>
								{/* App icon and label - improved visibility */}
								<div
									className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none"
									style={{ direction: 'ltr' }}
								>
									<div className="w-5 h-5 rounded-md bg-card/90 border border-border/50 p-0.5 shadow-sm">
										<img
											src={`http://localhost:11435/app-icon?name=${encodeURIComponent(group.appName)}`}
											className="w-full h-full opacity-80 rounded-sm"
											alt={group.appName}
											loading="lazy"
											decoding="async"
										/>
									</div>
									{showLabel && (
										<span
											className={cn(
												"text-[10px] font-medium text-foreground/70 bg-background/60 backdrop-blur-sm px-1.5 py-0.5 rounded truncate",
												showFullLabel ? "max-w-[100px]" : "max-w-[50px]"
											)}
										>
											{group.appName}
										</span>
									)}
								</div>

								{group.frames.map((frame, frameIdx) => {
									// O(1) lookup instead of O(n) indexOf
									const frameIndex = frameIndexMap.get(frame.timestamp) ?? -1;
									const isSelected = selectedIndices.has(frameIndex);
									const frameDate = new Date(frame.timestamp);
									const isInRange =
										selectionRange &&
										frameDate >= selectionRange.start &&
										frameDate <= selectionRange.end;

									const hasAudio = Boolean(frame?.devices?.[0]?.audio?.length);
									const isCurrent = frameIndex === currentIndex;

									// Show time marker on first frame of each hour
									const showTimeMarker = timeMarkers.some(
										m => m.position === visibleFrames.indexOf(frame)
									);
									const timeMarker = showTimeMarker
										? timeMarkers.find(m => m.position === visibleFrames.indexOf(frame))
										: null;

									return (
										<motion.div
											key={frame.timestamp}
											data-timestamp={frame.timestamp}
											className={cn(
												"flex-shrink-0 cursor-ew-resize rounded-t relative hover:z-50 transition-all duration-200",
												(isSelected || isInRange) && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-black/20"
											)}
											style={{
												width: `${frameWidth}px`,
												marginLeft: `${frameMargin}px`,
												marginRight: `${frameMargin}px`,
												backgroundColor: isCurrent ? 'hsl(var(--foreground))' : group.color,
												height: isCurrent || isSelected || isInRange ? "75%" : "45%",
												opacity: isCurrent || isSelected || isInRange ? 1 : 0.7,
												direction: "ltr",
												boxShadow: isCurrent ? '0 0 10px rgba(255, 255, 255, 0.4), 0 0 20px rgba(255, 255, 255, 0.2)' : 'none',
												transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
												transition: 'all 0.2s ease-out',
												borderRadius: '4px 4px 0 0',
											}}
											whileHover={{
												height: "75%",
												opacity: 1,
												scale: 1.05,
												transition: { duration: 0.15 }
											}}
											whileTap={{
												scale: 0.95,
												transition: { duration: 0.1 }
											}}
											onMouseDown={() => handleDragStart(frameIndex)}
											onMouseEnter={() => {
												setHoveredTimestamp(frame.timestamp);
												handleDragOver(frameIndex);
											}}
											onMouseLeave={() => setHoveredTimestamp(null)}
										>
											{/* Audio indicator - visible line at top of bar */}
											{hasAudio && (
												<div className="absolute top-0 left-0 right-0 h-1 bg-foreground/80 rounded-t" />
											)}

											{/* Time marker below frame */}
											{timeMarker && (
												<div
													className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-muted-foreground whitespace-nowrap"
													style={{ direction: 'ltr' }}
												>
													{timeMarker.time}
												</div>
											)}

											{/* Tooltip on hover */}
											{(hoveredTimestamp === frame.timestamp ||
												frames[currentIndex]?.timestamp === frame.timestamp) && (
												<div className="absolute bottom-full left-1/2 z-50 -translate-x-1/2 mb-2 w-max bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-2xl">
													<div className="flex items-center gap-2 mb-1">
														<img
															src={`http://localhost:11435/app-icon?name=${encodeURIComponent(group.appName)}`}
															className="w-4 h-4 rounded"
															alt=""
														/>
														<p className="font-medium text-popover-foreground">
															{getFrameAppName(frame)}
														</p>
													</div>
													<p className="text-muted-foreground">
														{format(new Date(frame.timestamp), 'h:mm:ss a')}
													</p>
													{hasAudio && (
														<p className="text-muted-foreground flex items-center gap-1 mt-1">
															<Mic className="w-3 h-3" />
															<span>audio recorded</span>
														</p>
													)}
												</div>
											)}
										</motion.div>
									);
								})}
							</div>
						);
					})}
					<div ref={observerTargetRef} className="h-full w-1" />
				</motion.div>
			</div>

			{/* Time axis legend at bottom */}
			<div className="absolute bottom-0 left-0 right-0 h-6 flex items-center justify-center pointer-events-none">
				<div className="flex items-center gap-4 text-[10px] text-muted-foreground">
					<span className="flex items-center gap-1">
						<div className="w-3 h-3 rounded bg-foreground" />
						<span>current</span>
					</span>
					<span className="flex items-center gap-1">
						<div className="w-3 h-3 rounded bg-muted-foreground/50 relative">
							<div className="absolute top-0 left-0 right-0 h-0.5 bg-foreground rounded-t" />
						</div>
						<span>has audio</span>
					</span>
					<span className="opacity-60">scroll to navigate • pinch to zoom</span>
				</div>
			</div>
		</div>
	);
};
