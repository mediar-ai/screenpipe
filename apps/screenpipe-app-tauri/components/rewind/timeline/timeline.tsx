import { StreamTimeSeriesResponse, TimeRange } from "@/components/rewind/timeline";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { isAfter, subDays, format } from "date-fns";
import { motion, useScroll, useTransform } from "framer-motion";
import { ZoomIn, ZoomOut, Mic } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import { AppContextPopover } from "./app-context-popover";

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
	isSearchModalOpen?: boolean; // When true, disable wheel/focus handling to not interfere with modal
	zoomLevel: number;
	targetZoom: number;
	setTargetZoom: (fn: (prev: number) => number) => void;
}

interface AppGroup {
	appName: string; // Primary app (for backwards compatibility)
	appNames: string[]; // All unique apps in this group
	frames: StreamTimeSeriesResponse[];
	color: string;
	colors: string[]; // Colors for all apps
	iconSrc?: string;
}

// App category definitions for semantic grayscale coloring
const APP_CATEGORIES: Record<string, string[]> = {
	// Browsers - darkest (most common, need clear distinction)
	browser: [
		'chrome', 'google chrome', 'firefox', 'safari', 'edge', 'microsoft edge',
		'brave', 'opera', 'vivaldi', 'arc', 'zen', 'orion', 'chromium'
	],
	// Development tools - dark gray
	dev: [
		'code', 'vs code', 'visual studio', 'cursor', 'terminal', 'iterm',
		'warp', 'xcode', 'android studio', 'intellij', 'webstorm', 'pycharm',
		'sublime', 'atom', 'vim', 'neovim', 'emacs', 'github', 'gitlab',
		'postman', 'insomnia', 'docker', 'figma', 'sketch', 'zed'
	],
	// Communication - medium gray
	communication: [
		'slack', 'discord', 'zoom', 'teams', 'microsoft teams', 'messages',
		'whatsapp', 'telegram', 'signal', 'skype', 'webex', 'meet', 'facetime',
		'mail', 'outlook', 'gmail', 'thunderbird', 'spark', 'notion', 'linear',
		'loom', 'around', 'gather'
	],
	// Media & Entertainment - light gray
	media: [
		'spotify', 'youtube', 'music', 'apple music', 'vlc', 'netflix', 'tv',
		'prime video', 'disney', 'hulu', 'twitch', 'podcasts', 'audible',
		'photos', 'preview', 'quicktime', 'iina', 'plex', 'mpv'
	],
	// Productivity - medium-light gray
	productivity: [
		'notes', 'obsidian', 'roam', 'bear', 'evernote', 'onenote',
		'word', 'excel', 'powerpoint', 'pages', 'numbers', 'keynote',
		'google docs', 'sheets', 'slides', 'calendar', 'reminders', 'todoist',
		'things', 'fantastical', 'craft', 'ulysses', 'ia writer'
	],
};

// Grayscale colors for each category (from dark to light)
const CATEGORY_COLORS: Record<string, string> = {
	browser: '#1a1a1a',      // Very dark - browsers are most common
	dev: '#3d3d3d',          // Dark gray - dev tools
	communication: '#666666', // Medium gray - communication
	productivity: '#8a8a8a',  // Medium-light - productivity
	media: '#ababab',        // Light gray - media
	other: '#cccccc',        // Lightest - unknown/other apps
};

// Get category for an app name
function getAppCategory(appName: string): string {
	const lowerName = appName.toLowerCase();
	for (const [category, apps] of Object.entries(APP_CATEGORIES)) {
		if (apps.some(app => lowerName.includes(app) || app.includes(lowerName))) {
			return category;
		}
	}
	return 'other';
}

// Get grayscale color based on app category
export function getAppCategoryColor(appName: string): string {
	const category = getAppCategory(appName);
	return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
}

// Legacy function name for backwards compatibility
export function stringToColor(str: string): string {
	return getAppCategoryColor(str);
}

// Get the app name from a frame, preferring devices with non-empty app names
export function getFrameAppName(frame: StreamTimeSeriesResponse | undefined): string {
	if (!frame?.devices?.length) return 'Unknown';
	// Find first device with a non-empty app_name
	const deviceWithApp = frame.devices.find(d => d.metadata?.app_name);
	return deviceWithApp?.metadata?.app_name || 'Unknown';
}

// Get ALL app names from a frame (for multi-app display)
export function getFrameAppNames(frame: StreamTimeSeriesResponse | undefined): string[] {
	if (!frame?.devices?.length) return ['Unknown'];
	const appNames = frame.devices
		.map(d => d.metadata?.app_name)
		.filter((name): name is string => Boolean(name));
	return appNames.length > 0 ? [...new Set(appNames)] : ['Unknown'];
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
	isSearchModalOpen = false,
	zoomLevel,
	targetZoom,
	setTargetZoom,
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
	const [hoveredRect, setHoveredRect] = useState<{ x: number; y: number } | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
	const [hasDragMoved, setHasDragMoved] = useState(false); // Track if mouse moved during drag
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const { setSelectionRange, selectionRange } = useTimelineSelection();

	// App context popover state
	const [activePopoverGroup, setActivePopoverGroup] = useState<number | null>(null);
	const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

	const MIN_ZOOM = 0.25;
	const MAX_ZOOM = 4;

	// Auto-focus container on mount so zoom works immediately
	// But skip when search modal is open to not steal focus from modal input
	useEffect(() => {
		if (isSearchModalOpen) return;

		const container = containerRef.current;
		if (container) {
			// Small delay to ensure DOM is ready
			requestAnimationFrame(() => {
				// preventScroll: true prevents the browser from scrolling the container
				// to the focus target, which would reset the timeline position after
				// navigating from search results
				container.focus({ preventScroll: true });
			});
		}
	}, [isSearchModalOpen]);

	// Calculate frame width based on zoom level
	const frameWidth = useMemo(() => {
		const baseWidth = 6; // 1.5 * 4 = 6px base (w-1.5 = 0.375rem = 6px)
		return Math.max(2, Math.round(baseWidth * zoomLevel));
	}, [zoomLevel]);

	const frameMargin = useMemo(() => {
		const baseMargin = 2; // mx-0.5 = 0.125rem = 2px
		return Math.max(1, Math.round(baseMargin * zoomLevel));
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
		let currentGroupAllApps = new Set<string>();

		visibleFrames.forEach((frame) => {
			const appName = getFrameAppName(frame);
			const allAppsInFrame = getFrameAppNames(frame);

			if (appName !== currentApp) {
				if (currentGroup.length > 0) {
					const allApps = [...currentGroupAllApps];
					groups.push({
						appName: currentApp,
						appNames: allApps,
						frames: currentGroup,
						color: stringToColor(currentApp),
						colors: allApps.map(app => stringToColor(app)),
					});
				}
				currentApp = appName;
				currentGroup = [frame];
				currentGroupAllApps = new Set(allAppsInFrame);
			} else {
				currentGroup.push(frame);
				allAppsInFrame.forEach(app => currentGroupAllApps.add(app));
			}
		});

		if (currentGroup.length > 0) {
			const allApps = [...currentGroupAllApps];
			groups.push({
				appName: currentApp,
				appNames: allApps,
				frames: currentGroup,
				color: stringToColor(currentApp),
				colors: allApps.map(app => stringToColor(app)),
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
		setActivePopoverGroup(null); // Close popover when interacting with frames
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
									// borderLeft removed — caused visible white lines between groups
								}}
							>
								{/* Vertical stacked app icons - click for context popover */}
								{groupWidth > 30 && (
									<motion.div
										className="absolute top-1 left-1/2 -translate-x-1/2 z-10 flex flex-col cursor-pointer p-1.5"
										style={{ 
											direction: 'ltr',
											pointerEvents: 'auto',
											isolation: 'isolate'
										}}
										whileHover="expanded"
										initial="collapsed"
										onClick={(e) => {
											e.stopPropagation();
											const rect = e.currentTarget.getBoundingClientRect();
											setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.top });
											setActivePopoverGroup(
												activePopoverGroup === groupIndex ? null : groupIndex
											);
										}}
									>
										{group.appNames.slice(0, 2).map((appName, idx) => (
											<motion.div
												key={`${appName}-${idx}`}
												className="w-8 h-8 rounded flex-shrink-0 overflow-hidden flex items-center justify-center"
												style={{ 
													zIndex: 10 - idx,
													position: 'relative'
												}}
												variants={{
													collapsed: { 
														marginTop: idx === 0 ? 0 : -10,
														scale: 1
													},
													expanded: { 
														marginTop: idx === 0 ? 0 : 4,
														scale: 1.1
													}
												}}
												transition={{ type: "spring", stiffness: 400, damping: 25 }}
											>
												<img
													src={`http://localhost:11435/app-icon?name=${encodeURIComponent(appName)}`}
													className="w-full h-full rounded-sm object-contain scale-110"
													alt={appName}
													loading="lazy"
													decoding="async"
												/>
											</motion.div>
										))}
									</motion.div>
								)}

								{/* App context popover */}
								{activePopoverGroup === groupIndex && (
									<AppContextPopover
										appName={group.appName}
										appNames={group.appNames}
										frames={group.frames}
										anchor={popoverAnchor}
										onClose={() => setActivePopoverGroup(null)}
									/>
								)}

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

									const shouldShowTooltip = hoveredTimestamp
										? hoveredTimestamp === frame.timestamp
										: frames[currentIndex]?.timestamp === frame.timestamp;

									return (
										<motion.div
											key={`${frame.timestamp}-${frameIdx}`}
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
											onMouseEnter={(e) => {
												const rect = e.currentTarget.getBoundingClientRect();
												setHoveredRect({ x: rect.left + rect.width / 2, y: rect.top });
												setHoveredTimestamp(frame.timestamp);
												handleDragOver(frameIndex);
											}}
											onMouseLeave={() => {
												setHoveredTimestamp(null);
												setHoveredRect(null);
											}}
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

											{/* Tooltip on hover — rendered via portal to escape overflow clipping */}
											{shouldShowTooltip && hoveredRect && createPortal(
												<div
													className="fixed z-[9999] w-max bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-2xl pointer-events-none"
													style={{
														left: `clamp(80px, ${hoveredRect.x}px, calc(100vw - 80px))`,
														top: `${hoveredRect.y}px`,
														transform: "translate(-50%, -100%) translateY(-8px)",
													}}
												>
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
												</div>,
												document.body
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

			{/* Time axis legend - hidden, too small to be useful */}
			<div className="hidden">
			</div>
		</div>
	);
};
