import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useRef, useCallback } from "react";
import { useFrameOcrData } from "@/lib/hooks/use-frame-ocr-data";
import { TextOverlay } from "@/components/text-overlay";
import { ExternalLink, FileX, AlertTriangle, WifiOff, ImageOff, RefreshCw, SkipForward, ChevronLeft, ChevronRight } from "lucide-react";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
	onNavigate?: (direction: "prev" | "next") => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
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

	if (!frameId) {
		return (
			<div className="absolute inset-0 overflow-hidden">
				{/* Elegant gradient background */}
				<div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />

				{/* Content */}
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="max-w-sm w-full mx-4">
						<div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
							{/* Icon */}
							<div className="flex justify-center mb-6">
								<div className="w-16 h-16 rounded-full bg-slate-500/20 border border-slate-500/30 flex items-center justify-center">
									<ImageOff className="w-8 h-8 text-slate-400" />
								</div>
							</div>

							{/* Text content */}
							<div className="text-center space-y-3">
								<h3 className="text-xl font-semibold text-white">
									No Frame Selected
								</h3>
								<p className="text-sm text-slate-300 leading-relaxed">
									Select a point on the timeline to view a recorded frame.
								</p>
							</div>

							{/* Navigation hint */}
							{onNavigate && (
								<div className="mt-8 flex gap-2">
									<button
										onClick={() => onNavigate("prev")}
										disabled={!canNavigatePrev}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/50 rounded-xl text-slate-300 text-sm font-medium transition-all duration-200"
									>
										<ChevronLeft className="w-4 h-4" />
										Previous
									</button>
									<button
										onClick={() => onNavigate("next")}
										disabled={!canNavigateNext}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/50 rounded-xl text-slate-300 text-sm font-medium transition-all duration-200"
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
			{/* Open in Browser button for captured browser URLs - temporarily disabled */}
			{/* {hasValidUrl && !isLoading && !hasError && (
				<button
					onClick={handleOpenInBrowser}
					className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-2 bg-black/70 hover:bg-black/90 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm"
					title={`Open ${browserUrl}`}
				>
					<ExternalLink className="h-4 w-4" />
					Open in Browser
				</button>
			)} */}
			{hasError && !isLoading && (
				<div className="absolute inset-0 z-10 overflow-hidden">
					{/* Elegant gradient background */}
					<div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />

					{/* Subtle pattern overlay */}
					<div
						className="absolute inset-0 opacity-5"
						style={{
							backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
						}}
					/>

					{/* Content */}
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="max-w-sm w-full mx-4">
							{/* Main card */}
							<div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
								{/* Icon */}
								<div className="flex justify-center mb-6">
									<div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
										<FileX className="w-8 h-8 text-amber-400" />
									</div>
								</div>

								{/* Text content */}
								<div className="text-center space-y-3">
									<h3 className="text-xl font-semibold text-white">
										Frame Unavailable
									</h3>
									<p className="text-sm text-slate-300 leading-relaxed">
										This recording could not be loaded. The video file may be temporarily unavailable or still processing.
									</p>

									{/* Frame ID badge */}
									<div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50">
										<span className="text-xs text-slate-400">Frame</span>
										<span className="text-xs font-mono text-slate-300">{frameId}</span>
									</div>
								</div>

								{/* Actions */}
								<div className="mt-8 space-y-3">
									{/* Primary action: Retry or Navigate */}
									{retryCount < 3 ? (
										<button
											onClick={handleRetry}
											className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-xl text-white text-sm font-medium transition-all duration-200"
										>
											<RefreshCw className="w-4 h-4" />
											Try Again
											<span className="text-white/50 text-xs">({3 - retryCount} left)</span>
										</button>
									) : (
										<div className="text-center text-sm text-slate-400 py-2">
											Retries exhausted
										</div>
									)}

									{/* Navigation buttons */}
									{onNavigate && (
										<div className="flex gap-2">
											<button
												onClick={() => onNavigate("prev")}
												disabled={!canNavigatePrev}
												className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/50 rounded-xl text-slate-300 text-sm font-medium transition-all duration-200"
											>
												<ChevronLeft className="w-4 h-4" />
												Previous
											</button>
											<button
												onClick={() => onNavigate("next")}
												disabled={!canNavigateNext}
												className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/50 rounded-xl text-slate-300 text-sm font-medium transition-all duration-200"
											>
												Next
												<ChevronRight className="w-4 h-4" />
											</button>
										</div>
									)}
								</div>
							</div>

							{/* Help text */}
							<p className="text-center text-xs text-slate-500 mt-4">
								If this persists, try restarting the screenpipe server
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
