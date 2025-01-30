import { StreamTimeSeriesResponse, TimeRange } from "@/app/page";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { isAfter, subDays } from "date-fns";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

interface TimelineSliderProps {
	frames: StreamTimeSeriesResponse[];
	currentIndex: number;
	startAndEndDates: TimeRange;
	onFrameChange: (index: number) => void;
	fetchNextDayData: (date: Date) => void;
	currentDate: Date;
	onSelectionChange?: (selectedFrames: StreamTimeSeriesResponse[]) => void;
}

interface AppGroup {
	appName: string;
	frames: StreamTimeSeriesResponse[];
	color: string;
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

export const TimelineSlider = ({
	frames,
	currentIndex,
	onFrameChange,
	fetchNextDayData,
	startAndEndDates,
	currentDate,
	onSelectionChange,
}: TimelineSliderProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const { scrollXProgress } = useScroll({
		container: containerRef,
		offset: ["start end", "end start"],
	});
	const lineWidth = useTransform(scrollXProgress, [0, 1], ["0%", "100%"]);
	const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const { setSelectionRange, selectionRange } = useTimelineSelection();

	const appGroups = useMemo(() => {
		const groups: AppGroup[] = [];
		let currentApp = "";
		let currentGroup: StreamTimeSeriesResponse[] = [];

		frames.forEach((frame) => {
			const appName = frame.devices[0].metadata.app_name;
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
	}, [frames]);

	// Add effect to keep current frame in view
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
		const container = containerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollLeft, scrollWidth, clientWidth } = container;

			// Check if we're near the end (right side) of the scroll area
			const isNearEnd = scrollLeft + clientWidth >= scrollWidth - clientWidth;

			const lastDate = subDays(currentDate, 1);
			if (isNearEnd && isAfter(lastDate, startAndEndDates.start)) {
				console.log("fetching next day's data", currentDate);
				fetchNextDayData(lastDate);
			}
		};

		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, [fetchNextDayData, currentDate, startAndEndDates]);

	useEffect(() => {
		if (!selectionRange) {
			setSelectedIndices(new Set());
		}
	}, [selectionRange]);

	// Handle drag start
	const handleDragStart = (index: number) => {
		setIsDragging(true);
		setDragStartIndex(index);
		setSelectedIndices(new Set([index]));

		// Set initial selection range
		const startDate = new Date(frames[index].timestamp);
		setSelectionRange({ start: startDate, end: startDate });
	};

	// Handle drag over
	const handleDragOver = (index: number) => {
		if (isDragging && dragStartIndex !== null) {
			const start = Math.min(dragStartIndex, index);
			const end = Math.max(dragStartIndex, index);
			const newSelection = new Set<number>();

			for (let i = start; i <= end; i++) {
				newSelection.add(i);
			}

			setSelectedIndices(newSelection);

			// Update selection range
			setSelectionRange({
				end: new Date(frames[start].timestamp),
				start: new Date(frames[end].timestamp),
			});

			// Notify parent of selection change
			if (onSelectionChange) {
				const selectedFrames = Array.from(newSelection).map((i) => frames[i]);
				onSelectionChange(selectedFrames);
			}
		}
	};

	// Handle drag end
	const handleDragEnd = () => {
		setIsDragging(false);
		setDragStartIndex(null);
	};

	return (
		<div className="relative w-full">
			<motion.div
				className="absolute top-0 h-1 bg-blue-500/0"
				style={{ width: lineWidth }}
			/>
			<div
				ref={containerRef}
				className="w-full overflow-x-auto scroll-smooth scrollbar-hide"
				style={{ scrollBehavior: "auto" }}
			>
				<motion.div
					className="whitespace-nowrap flex flex-nowrap w-max justify-center px-[50vw] h-40"
					onMouseUp={handleDragEnd}
					onMouseLeave={handleDragEnd}
				>
					{appGroups.map((group, groupIndex) => (
						<div
							key={`${group.appName}-${groupIndex}`}
							className="flex flex-nowrap items-end h-full group pt-20"
						>
							{group.frames.map((frame) => {
								const frameIndex = frames.indexOf(frame);
								const isSelected = selectedIndices.has(frameIndex);
								const frameDate = new Date(frame.timestamp);
								const isInRange =
									selectionRange &&
									frameDate >= selectionRange.start &&
									frameDate <= selectionRange.end;
								return (
									<motion.div
										key={frame.timestamp}
										data-timestamp={frame.timestamp}
										className={`flex-shrink-0 cursor-pointer w-2 mx-0.5 rounded-t relative group hover:z-50 ${
											isSelected || isInRange
												? "ring-2 ring-blue-500 ring-offset-1"
												: ""
										}`}
										style={{
											backgroundColor: group.color,
											height:
												frameIndex === currentIndex || isSelected || isInRange
													? "100%"
													: "70%",
											opacity:
												frameIndex === currentIndex || isSelected || isInRange
													? 1
													: 0.7,
										}}
										whileHover={{ height: "100%", opacity: 1 }}
										onMouseDown={() => handleDragStart(frameIndex)}
										onMouseEnter={() => {
											setHoveredTimestamp(frame.timestamp);
											handleDragOver(frameIndex);
										}}
										onMouseLeave={() => setHoveredTimestamp(null)}
									>
										{hoveredTimestamp === frame.timestamp && (
											<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 w-max bg-background border rounded-md px-2 py-1 text-xs shadow-lg">
												<p className="font-medium">
													{frame.devices[0].metadata.app_name}
												</p>
												<p className="text-muted-foreground">
													{new Date(frame.timestamp).toLocaleString()}
												</p>
											</div>
										)}
									</motion.div>
								);
							})}
						</div>
					))}
				</motion.div>
			</div>
		</div>
	);
};
