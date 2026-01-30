import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useRef } from "react";
import { useFrameOcrData } from "@/lib/hooks/use-frame-ocr-data";
import { TextOverlay } from "@/components/text-overlay";
import { ImageOff, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
	onNavigate?: (direction: "prev" | "next") => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
	onFrameUnavailable?: () => void;
}

export const SkeletonLoader: FC = () => {
	return (
		<div className="absolute inset-0 w-full h-full bg-gray-900/50 overflow-hidden">
			<div
				className="w-full h-full bg-gradient-to-r from-gray-800/30 via-gray-600/30 to-gray-800/30 animate-shimmer"
				style={{
					backgroundSize: "200% 100%",
					animation: "shimmer 1.5s infinite linear",
				}}
			/>
		</div>
	);
};

export const CurrentFrameTimeline: FC<CurrentFrameTimelineProps> = ({
	currentFrame,
	onNavigate,
	canNavigatePrev = true,
	canNavigateNext = true,
	onFrameUnavailable,
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [naturalDimensions, setNaturalDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	// For object-cover, track the full rendered size and crop offset
	const [renderedImageInfo, setRenderedImageInfo] = useState<{
		width: number;
		height: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const frameId = currentFrame?.devices?.[0]?.frame_id;
	const imageUrl = `http://localhost:3030/frames/${frameId}`;

	// Fetch OCR text positions for text selection overlay
	const { textPositions } = useFrameOcrData(
		frameId ? parseInt(frameId, 10) : null
	);

	// Reset loading state when frame changes, but be smarter about it
	React.useEffect(() => {
		if (frameId && !imageRef.current?.complete) {
			setIsLoading(true);
			setHasError(false);
			setRetryCount(0);
			setNaturalDimensions(null);
		}
	}, [frameId]);

	// Update rendered image info on resize
	// For object-cover: image fills container, may be cropped, centered
	React.useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current && naturalDimensions) {
				const containerRect = containerRef.current.getBoundingClientRect();
				const containerAspect = containerRect.width / containerRect.height;
				const imageAspect = naturalDimensions.width / naturalDimensions.height;

				let renderedWidth: number;
				let renderedHeight: number;

				if (containerAspect > imageAspect) {
					// Container is wider than image aspect - width fills, height overflows
					renderedWidth = containerRect.width;
					renderedHeight = containerRect.width / imageAspect;
				} else {
					// Container is taller than image aspect - height fills, width overflows
					renderedHeight = containerRect.height;
					renderedWidth = containerRect.height * imageAspect;
				}

				// Calculate crop offset (image is centered with object-cover)
				const offsetX = (containerRect.width - renderedWidth) / 2;
				const offsetY = (containerRect.height - renderedHeight) / 2;

				setRenderedImageInfo({
					width: renderedWidth,
					height: renderedHeight,
					offsetX,
					offsetY,
				});
			}
		};

		updateDimensions();
		window.addEventListener("resize", updateDimensions);
		return () => window.removeEventListener("resize", updateDimensions);
	}, [naturalDimensions]);

	const handleRetry = () => {
		if (retryCount < 3) {
			setRetryCount(prev => prev + 1);
			setIsLoading(true);
			setHasError(false);
		}
	};

	// Auto-skip to next frame when error occurs
	React.useEffect(() => {
		if (hasError && !isLoading && onFrameUnavailable) {
			// Small delay to avoid rapid skipping
			const timer = setTimeout(() => {
				onFrameUnavailable();
			}, 300);
			return () => clearTimeout(timer);
		}
	}, [hasError, isLoading, onFrameUnavailable]);

	if (!frameId) {
		return (
			<div className="absolute inset-0 overflow-hidden bg-background">
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="max-w-sm w-full mx-4">
						<div className="bg-card border border-border p-8">
							<div className="flex justify-center mb-6">
								<div className="w-16 h-16 border border-border flex items-center justify-center">
									<ImageOff className="w-8 h-8 text-muted-foreground" />
								</div>
							</div>

							<div className="text-center space-y-3">
								<h3 className="text-xl font-mono font-semibold text-foreground uppercase tracking-wide">
									No Frame Selected
								</h3>
								<p className="text-sm font-mono text-muted-foreground leading-relaxed">
									Select a point on the timeline to view a recorded frame.
								</p>
							</div>

							{onNavigate && (
								<div className="mt-8 flex gap-2">
									<button
										onClick={() => onNavigate("prev")}
										disabled={!canNavigatePrev}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed border border-border text-foreground text-sm font-mono uppercase transition-colors"
									>
										<ChevronLeft className="w-4 h-4" />
										Previous
									</button>
									<button
										onClick={() => onNavigate("next")}
										disabled={!canNavigateNext}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed border border-border text-foreground text-sm font-mono uppercase transition-colors"
									>
										Next
										<ChevronRight className="w-4 h-4" />
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="absolute inset-0 w-full h-full">
			{isLoading && <SkeletonLoader />}
			<img
				src={imageUrl}
				ref={imageRef}
				className="absolute inset-0 w-full h-full object-cover"
				style={{
					zIndex: 1,
					display: hasError ? 'none' : 'block',
					opacity: isLoading ? 0 : 1,
					transition: 'opacity 0.2s ease-in-out',
				}}
				alt="Current frame"
				draggable={false}
				onLoad={(e) => {
					const img = e.target as HTMLImageElement;
					console.log('Image loaded successfully for frame:', frameId);
					setIsLoading(false);
					setHasError(false);
					setNaturalDimensions({
						width: img.naturalWidth,
						height: img.naturalHeight,
					});
				}}
				onError={() => {
					console.log('Image failed to load for frame:', frameId);
					setIsLoading(false);
					setHasError(true);
				}}
			/>
			{/* Text selection overlay for timeline view */}
			{/* Position overlay to match the actual rendered image (accounting for object-cover cropping) */}
			{!isLoading && !hasError && naturalDimensions && renderedImageInfo && textPositions.length > 0 && (
				<div
					className="absolute overflow-hidden"
					style={{
						zIndex: 2,
						// Clip to container bounds
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
					}}
				>
					<div
						style={{
							// Position the overlay to match where the image actually renders
							// For object-cover, offsets are negative when image overflows
							position: 'absolute',
							left: renderedImageInfo.offsetX,
							top: renderedImageInfo.offsetY,
							width: renderedImageInfo.width,
							height: renderedImageInfo.height,
						}}
					>
						<TextOverlay
							textPositions={textPositions}
							originalWidth={naturalDimensions.width}
							originalHeight={naturalDimensions.height}
							displayedWidth={renderedImageInfo.width}
							displayedHeight={renderedImageInfo.height}
							clickableUrls={true}
						/>
					</div>
				</div>
			)}
			{/* When frame is unavailable, show skeleton while auto-skipping */}
			{hasError && !isLoading && (
				<div className="absolute inset-0 z-10">
					<SkeletonLoader />
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="flex items-center gap-2 px-4 py-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border">
							<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
							<span className="text-sm text-muted-foreground">Finding next frame...</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
