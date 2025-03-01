import { StreamTimeSeriesResponse, TimeRange } from "@/app/page";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { isAfter, subDays } from "date-fns";
import { motion, useScroll, useTransform } from "framer-motion";
import { AudioLinesIcon } from "lucide-react";
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
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const { setSelectionRange, selectionRange } = useTimelineSelection();

	const visibleFrames = useMemo(() => {
		const start = Math.max(0, currentIndex - 100);
		const end = Math.min(frames.length, currentIndex + 100);
		return frames.slice(start, end);
	}, [frames, currentIndex]);

	const appGroups = useMemo(() => {
		const groups: AppGroup[] = [];
		let currentApp = "";
		let currentGroup: StreamTimeSeriesResponse[] = [];

		visibleFrames.forEach((frame) => {
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

	const handleDragStart = (index: number) => {
		setIsDragging(true);
		setDragStartIndex(index);
		setSelectedIndices(new Set([index]));

		const startDate = new Date(frames[index].timestamp);
		setSelectionRange({ start: startDate, end: startDate });
	};

	const handleDragOver = (index: number) => {
		if (isDragging && dragStartIndex !== null) {
			const start = Math.min(dragStartIndex, index);
			const end = Math.max(dragStartIndex, index);
			const newSelection = new Set<number>();

			for (let i = start; i <= end; i++) {
				newSelection.add(i);
			}

			setSelectedIndices(newSelection);

			setSelectionRange({
				end: new Date(frames[start].timestamp),
				start: new Date(frames[end].timestamp),
			});

			if (onSelectionChange) {
				const selectedFrames = Array.from(newSelection).map((i) => frames[i]);
				onSelectionChange(selectedFrames);
			}
		}
	};

	const handleDragEnd = () => {
		setIsDragging(false);
		setDragStartIndex(null);
	};

	return (
		<div className="relative w-full" dir="rtl">
			<motion.div
				className="absolute top-0 h-1 bg-blue-500/0"
				style={{ width: lineWidth }}
			/>
			<div
				ref={containerRef}
				className="w-full overflow-x-auto scroll-smooth scrollbar-hide"
				style={{
					scrollBehavior: "auto",
				}}
			>
				<motion.div
					className="whitespace-nowrap flex flex-nowrap w-max justify-center px-[50vw] h-40 sticky right-0"
					onMouseUp={handleDragEnd}
					onMouseLeave={handleDragEnd}
				>
					{appGroups.map((group, groupIndex) => (
						<div
							key={`${group.appName}-${groupIndex}`}
							className="flex flex-nowrap items-end h-full group pt-20 relative"
							dir="rtl"
						>
							<div className="absolute top-0 left-1/2 w-5 h-5 rounded-full -translate-x-1/2 bg-background/50 backdrop-blur p-0.5">
								<img
									src={`http://localhost:11435/app-icon?name=${group.appName}`}
									className="w-full h-full opacity-70"
									alt={group.appName}
									loading="lazy"
									decoding="async"
								/>
							</div>
							{group.frames.map((frame) => {
								const frameIndex = frames.indexOf(frame);
								const isSelected = selectedIndices.has(frameIndex);
								const frameDate = new Date(frame.timestamp);
								const isInRange =
									selectionRange &&
									frameDate >= selectionRange.start &&
									frameDate <= selectionRange.end;

								const hasAudio = Boolean(frame.devices[0].audio.length);

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
													? "60%"
													: "40%",
											opacity:
												frameIndex === currentIndex || isSelected || isInRange
													? 1
													: 0.7,
											direction: "ltr",
										}}
										whileHover={{ height: "60%", opacity: 1 }}
										onMouseDown={() => handleDragStart(frameIndex)}
										onMouseEnter={() => {
											setHoveredTimestamp(frame.timestamp);
											handleDragOver(frameIndex);
										}}
										onMouseLeave={() => setHoveredTimestamp(null)}
									>
										{hasAudio && (
											<div className="absolute -top-5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full ">
												<AudioLinesIcon className="w-full h-full" />
											</div>
										)}
										{(hoveredTimestamp === frame.timestamp ||
											frames[currentIndex].timestamp === frame.timestamp) && (
											<div className="absolute bottom-full left-1/2 z-50 -translate-x-1/2 mb-6 w-max bg-background border rounded-md px-2 py-1 text-xs shadow-lg">
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
					<div ref={observerTargetRef} className="h-full w-1" />
				</motion.div>
			</div>
		</div>
	);
};
