import { format } from "date-fns";
import { useEffect, useRef, useMemo, useState, RefObject } from "react";
import { SearchMatch } from "@/lib/hooks/use-keyword-search-store";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";
import { cn } from "@/lib/utils";
import { throttle } from "lodash";
import { Loader2 } from "lucide-react";
import { useKeywordParams } from "@/lib/hooks/use-keyword-params";

export const SkeletonCard = () => (
	<div className="flex flex-col shrink-0 w-56 h-full relative overflow-hidden rounded-lg bg-white shadow-sm">
		<div className="aspect-video bg-neutral-200 animate-pulse" />
		<div className="p-3 space-y-2" style={{ direction: "ltr" }}>
			<div className="h-4 bg-neutral-200 rounded animate-pulse" />
			<div className="h-3 bg-neutral-200 rounded animate-pulse w-3/4" />
			<div className="h-3 bg-neutral-200 rounded animate-pulse w-1/2" />
		</div>
	</div>
);

export const ImageGrid = ({
	searchResult,
	pageRef,
}: {
	searchResult: SearchMatch[];
	pageRef: RefObject<HTMLDivElement | null>;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const { setCurrentResultIndex, currentResultIndex, searchKeywords } =
		useKeywordSearchStore();
	const [{ start_time, end_time, query, apps }] = useKeywordParams();
	const { searchResults, isSearching } = useKeywordSearchStore();

	const checkScrollAndFetch = useMemo(
		() =>
			throttle(() => {
				const container = containerRef.current;
				if (!container) return;
				if (searchResults.length === 0) return;

				const scrollPosition = Math.abs(container.scrollLeft);
				const scrollWidth = container.scrollWidth;
				const clientWidth = container.clientWidth;

				const scrollPercentage = scrollPosition / (scrollWidth - clientWidth);

				if (scrollPercentage > 0.6) {
					searchKeywords(query ?? "", {
						offset: searchResult.length,
						limit: 20,
						...(start_time && { start_time }),
						...(end_time && { end_time }),
						...(apps?.length && { app_names: apps }),
					});
				}
			}, 400),
		[searchResult.length, searchKeywords, query, start_time, end_time, apps],
	);

	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			container.addEventListener("scroll", checkScrollAndFetch);
		}

		return () => {
			if (container) {
				container.removeEventListener("scroll", checkScrollAndFetch);
			}
		};
	}, [checkScrollAndFetch]);

	const handleScroll = useMemo(
		() =>
			throttle(
				(e: WheelEvent) => {
					const isWithinAiPanel =
						e.target instanceof Node &&
						document.getElementById("ai-response")?.contains(e.target);

					if (isWithinAiPanel) return;

					e.preventDefault();
					e.stopPropagation();

					const scrollIntensity = Math.abs(e.deltaY);
					const direction = -Math.sign(e.deltaY);
					const limitIndexChange = 5;

					const indexChange =
						direction *
						Math.min(
							limitIndexChange,
							Math.ceil(Math.pow(scrollIntensity / 50, 1.5)),
						);

					requestAnimationFrame(() => {
						const newIndex = Math.min(
							Math.max(0, Math.floor(currentResultIndex + indexChange)),
							searchResult.length - 1,
						);
						setCurrentResultIndex(newIndex);
					});
				},
				16,
				{ leading: true, trailing: false },
			),
		[searchResult.length, currentResultIndex, setCurrentResultIndex],
	);

	useEffect(() => {
		const preventScroll = (e: WheelEvent) => {
			e.preventDefault();
		};

		document.addEventListener("wheel", preventScroll, { passive: false });
		return () => document.removeEventListener("wheel", preventScroll);
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (container && pageRef.current) {
			pageRef.current.addEventListener("wheel", handleScroll, {
				passive: false,
			});
		}

		return () => {
			if (container && pageRef.current) {
				pageRef.current.removeEventListener("wheel", handleScroll);
			}
		};
	}, [handleScroll]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !searchResult[currentResultIndex]) return;

		const currentTimestamp = searchResult[currentResultIndex].timestamp;
		const currentElement = container.querySelector(
			`[data-timestamp="${currentTimestamp}"]`,
		);

		if (!currentElement) return;

		requestAnimationFrame(() => {
			const containerWidth = container.clientWidth;
			const elementWidth = (currentElement as HTMLElement).offsetWidth;
			const elementOffsetRight =
				container.scrollWidth -
				((currentElement as HTMLElement).offsetLeft + elementWidth);

			const centerPosition =
				elementOffsetRight - (containerWidth - elementWidth) / 2;

			container.scrollTo({
				left: container.scrollWidth - containerWidth - centerPosition,
				behavior: "smooth",
			});
		});
	}, [currentResultIndex, searchResult]);

	return (
		<div className="relative w-full h-full">
			<div
				ref={containerRef}
				className="sticky inset-0 w-full overflow-x-auto overflow-y-hidden select-none scrollbar-hide"
				style={{ direction: "rtl" }}
			>
				<div className="inline-flex min-w-full px-[50vw]">
					<div className="flex flex-row gap-4 p-8" style={{ direction: "rtl" }}>
						{searchResult.map((result, index) => (
							<div
								key={result.frame_id}
								data-timestamp={result.timestamp}
								className={cn(
									"group flex flex-col shrink-0 w-56 h-full relative overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-300 hover:shadow-md snap-center cursor-pointer",
									currentResultIndex === index && "ring-2 ring-blue-500",
								)}
								onClick={() => setCurrentResultIndex(index)}
								style={{ direction: "ltr" }}
							>
								<div className="aspect-video overflow-hidden flex-1 relative">
									<div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
										<Loader2 className="h-5 w-5 animate-spin text-gray-400" />
									</div>
									<img
										src={`http://localhost:3030/frames/${result.frame_id}`}
										alt={`${result.app_name} - ${result.window_name}`}
										className="h-full w-full object-cover transition-transform duration-300 relative group-hover:scale-105"
										loading="lazy"
										draggable={false}
										onLoad={(e) => {
											(e.target as HTMLImageElement).style.opacity = "1";
										}}
										style={{ opacity: 0 }}
									/>
								</div>
								<div className="p-3 space-y-1">
									<p className="text-sm font-medium text-neutral-900 truncate">
										{result.app_name}
									</p>
									<p className="text-xs text-neutral-500 truncate">
										{result.window_name}
									</p>
									<p className="text-xs text-neutral-400">
										{format(new Date(result.timestamp), "PPp")}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

interface TextBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface TextPosition {
	text: string;
	confidence: number;
	bounds: TextBounds;
}

export const MainImage = () => {
	const { searchResults, currentResultIndex } = useKeywordSearchStore();
	const imageRef = useRef<HTMLImageElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [imageRect, setImageRect] = useState<DOMRect | null>(null);

	const currentFrame = searchResults[currentResultIndex];

	useEffect(() => {
		const updateImageRect = () => {
			if (imageRef.current) {
				const rect = imageRef.current.getBoundingClientRect();
				setImageRect(rect);
			}
		};

		updateImageRect();
		const resizeObserver = new ResizeObserver(updateImageRect);
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		window.addEventListener("resize", updateImageRect);
		return () => {
			window.removeEventListener("resize", updateImageRect);
			resizeObserver.disconnect();
		};
	}, [currentFrame]);

	if (!currentFrame) {
		return (
			<div className="relative col-span-3 aspect-video w-full h-full overflow-hidden rounded-lg bg-neutral-100">
				<div className="animate-pulse absolute inset-0 bg-neutral-200" />
				<div className="h-full w-full object-cover opacity-0 transition-opacity duration-300" />
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="relative aspect-auto w-full h-full overflow-hidden rounded-lg bg-neutral-100"
		>
			<div className="absolute inset-0 flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-gray-400" />
			</div>
			<div className="relative">
				<img
					ref={imageRef}
					src={`http://localhost:3030/frames/${currentFrame.frame_id}`}
					alt={`${currentFrame.app_name} - ${currentFrame.window_name}`}
					className="h-full w-full object-contain max-h-[75vh]"
					draggable={false}
					onLoad={(e) => {
						(e.target as HTMLImageElement).style.opacity = "1";
					}}
					style={{ opacity: 0 }}
				/>
				{imageRect && (
					<div
						className="absolute inset-0 pointer-events-none"
						style={{
							width: imageRect.width,
						}}
					/>
				)}
			</div>
		</div>
	);
};
