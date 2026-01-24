import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useRef, useCallback } from "react";
import { useFrameOcrData } from "@/lib/hooks/use-frame-ocr-data";
import { TextOverlay } from "@/components/text-overlay";
import { ExternalLink } from "lucide-react";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
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
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [naturalDimensions, setNaturalDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const [displayedDimensions, setDisplayedDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const frameId = currentFrame?.devices?.[0]?.frame_id;
	const browserUrl = currentFrame?.devices?.[0]?.metadata?.browser_url;
	// Simple image URL without cache busting
	const imageUrl = `http://localhost:3030/frames/${frameId}`;

	// Fetch OCR text positions for text selection overlay
	const { textPositions } = useFrameOcrData(
		frameId ? parseInt(frameId, 10) : null
	);

	const handleOpenInBrowser = useCallback(() => {
		if (browserUrl) {
			window.open(browserUrl, "_blank", "noopener,noreferrer");
		}
	}, [browserUrl]);

	// Only show "Open in Browser" for actual HTTP/HTTPS URLs
	const hasValidUrl = browserUrl &&
		(browserUrl.startsWith("http://") || browserUrl.startsWith("https://"));

	// Reset loading state when frame changes, but be smarter about it
	React.useEffect(() => {
		if (frameId && !imageRef.current?.complete) {
			setIsLoading(true);
			setHasError(false);
			setRetryCount(0);
			setNaturalDimensions(null);
		}
	}, [frameId]);

	// Update displayed dimensions on resize
	React.useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current && naturalDimensions) {
				const containerRect = containerRef.current.getBoundingClientRect();
				// For object-cover, we need to calculate the actual displayed size
				// The image fills the container while maintaining aspect ratio
				const containerAspect = containerRect.width / containerRect.height;
				const imageAspect = naturalDimensions.width / naturalDimensions.height;

				let displayedWidth: number;
				let displayedHeight: number;

				if (containerAspect > imageAspect) {
					// Container is wider, image height fills container
					displayedWidth = containerRect.width;
					displayedHeight = containerRect.width / imageAspect;
				} else {
					// Container is taller, image width fills container
					displayedHeight = containerRect.height;
					displayedWidth = containerRect.height * imageAspect;
				}

				setDisplayedDimensions({ width: displayedWidth, height: displayedHeight });
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

	if (!frameId) {
		return (
			<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
				<div className="text-center text-muted-foreground">
					<h3 className="text-lg font-medium mb-2">No Frame ID</h3>
					<p className="text-sm">Frame data is missing or invalid</p>
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
			{!isLoading && !hasError && naturalDimensions && displayedDimensions && textPositions.length > 0 && (
				<div
					className="absolute inset-0 flex items-center justify-center overflow-hidden"
					style={{ zIndex: 2 }}
				>
					<TextOverlay
						textPositions={textPositions}
						originalWidth={naturalDimensions.width}
						originalHeight={naturalDimensions.height}
						displayedWidth={displayedDimensions.width}
						displayedHeight={displayedDimensions.height}
						clickableUrls={true}
					/>
				</div>
			)}
			{/* Open in Browser button for captured browser URLs */}
			{hasValidUrl && !isLoading && !hasError && (
				<button
					onClick={handleOpenInBrowser}
					className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-2 bg-black/70 hover:bg-black/90 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm"
					title={`Open ${browserUrl}`}
				>
					<ExternalLink className="h-4 w-4" />
					Open in Browser
				</button>
			)}
			{hasError && !isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
					<div className="text-center text-muted-foreground">
						<h3 className="text-lg font-medium mb-2">Image Failed to Load</h3>
						<p className="text-sm">Could not load frame image</p>
						<p className="text-xs mt-2 opacity-50 font-mono">{frameId}</p>
						<div className="flex gap-2 mt-3">
							{retryCount < 3 && (
								<button
									onClick={handleRetry}
									className="px-3 py-1 bg-blue-600/80 hover:bg-blue-600 rounded text-xs transition-colors"
								>
									Retry ({retryCount}/3)
								</button>
							)}
							<button
								onClick={() => window.open(`http://localhost:3030/frames/${frameId}`, '_blank')}
								className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
							>
								Open in browser
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
