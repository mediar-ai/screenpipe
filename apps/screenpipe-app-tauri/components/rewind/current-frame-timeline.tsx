import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useRef, useEffect, useCallback } from "react";
import { useFrameOcrData } from "@/lib/hooks/use-frame-ocr-data";
import { TextOverlay } from "@/components/text-overlay";
import { ImageOff, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import posthog from "posthog-js";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
	onNavigate?: (direction: "prev" | "next") => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
	onFrameUnavailable?: () => void;
	onFrameLoadError?: () => void;
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

// Debounce delay for frame loading (ms)
// When scrolling fast, only load the frame after user "settles" for this duration
const FRAME_LOAD_DEBOUNCE_MS = 150;

export const CurrentFrameTimeline: FC<CurrentFrameTimelineProps> = ({
	currentFrame,
	onNavigate,
	canNavigatePrev = true,
	canNavigateNext = true,
	onFrameUnavailable,
	onFrameLoadError,
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [naturalDimensions, setNaturalDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	// For object-contain, track the full rendered size and padding offset
	const [renderedImageInfo, setRenderedImageInfo] = useState<{
		width: number;
		height: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);
	
	// Debounced frame ID - only updates after scroll settles
	const [debouncedFrameId, setDebouncedFrameId] = useState<string | null>(null);
	
	const imageRef = useRef<HTMLImageElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	
	// Abort controller for canceling pending image loads
	const abortControllerRef = useRef<AbortController | null>(null);
	
	// Debounce timer ref
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	
	// Performance tracking refs
	const frameLoadStartTimeRef = useRef<number | null>(null);
	const framesSkippedRef = useRef<number>(0);
	const lastFrameIdRef = useRef<string | null>(null);

	const frameId = currentFrame?.devices?.[0]?.frame_id;
	
	// Track frames skipped during fast scrolling (for analytics)
	useEffect(() => {
		if (frameId && lastFrameIdRef.current && frameId !== lastFrameIdRef.current) {
			// If we're changing frames and there was a previous frame that didn't finish loading
			if (frameLoadStartTimeRef.current !== null && debouncedFrameId !== frameId) {
				framesSkippedRef.current += 1;
			}
		}
		lastFrameIdRef.current = frameId;
	}, [frameId, debouncedFrameId]);
	
	// Debounce frame ID changes to avoid loading frames during fast scrolling
	// This is critical for performance - without debouncing, every scroll step
	// triggers a new HTTP request that won't be used
	useEffect(() => {
		// Clear any pending debounce
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}
		
		// If no frame, clear immediately
		if (!frameId) {
			setDebouncedFrameId(null);
			return;
		}
		
		// Show loading state immediately for responsive feel
		setIsLoading(true);
		
		// Debounce the actual frame ID update
		debounceTimerRef.current = setTimeout(() => {
			setDebouncedFrameId(frameId);
		}, FRAME_LOAD_DEBOUNCE_MS);
		
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [frameId]);
	
	// Construct image URL only for debounced frame ID
	const imageUrl = debouncedFrameId ? `http://localhost:3030/frames/${debouncedFrameId}` : null;

	// Fetch OCR text positions for text selection overlay
	// Use debounced frame ID to avoid unnecessary fetches
	const { textPositions } = useFrameOcrData(
		debouncedFrameId ? parseInt(debouncedFrameId, 10) : null
	);

	// Abort previous image load and start new one when debounced frame changes
	useEffect(() => {
		// Abort any pending request when frame changes
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		
		if (!debouncedFrameId || !imageUrl) {
			return;
		}
		
		// Start timing the frame load
		frameLoadStartTimeRef.current = performance.now();
		
		// Create new abort controller for this request
		abortControllerRef.current = new AbortController();
		
		// Reset state for new frame
		setHasError(false);
		setRetryCount(0);
		setNaturalDimensions(null);
		
		// Preload the image using fetch with abort signal
		// This allows us to cancel the request if user scrolls away
		const controller = abortControllerRef.current;
		
		fetch(imageUrl, { signal: controller.signal })
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.blob();
			})
			.then(blob => {
				// Request completed successfully - image will be in browser cache
				// The <img> tag will load it instantly from cache
				if (!controller.signal.aborted) {
					// Image is now cached, the img onLoad will handle the rest
				}
			})
			.catch(err => {
				if (err.name === 'AbortError') {
					// Request was aborted (user scrolled away) - this is expected
					console.log('Frame request aborted (user scrolled):', debouncedFrameId);
				} else {
					// Actual error
					console.error('Frame fetch error:', err);
					if (!controller.signal.aborted) {
						setIsLoading(false);
						setHasError(true);
						onFrameLoadError?.();
						
						// Track frame load failure
						if (frameLoadStartTimeRef.current !== null) {
							const loadTime = performance.now() - frameLoadStartTimeRef.current;
							posthog.capture("timeline_frame_load_time", {
								duration_ms: Math.round(loadTime),
								frame_id: debouncedFrameId,
								success: false,
								error: err.message,
								frames_skipped: framesSkippedRef.current,
							});
							frameLoadStartTimeRef.current = null;
							framesSkippedRef.current = 0;
						}
					}
				}
			});
		
		return () => {
			// Cleanup: abort if component unmounts or frame changes
			controller.abort();
		};
	}, [debouncedFrameId, imageUrl]);

	// Update rendered image info on resize
	// For object-contain: image fits within container, centered with letterboxing
	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current && naturalDimensions) {
				const containerRect = containerRef.current.getBoundingClientRect();
				const containerAspect = containerRect.width / containerRect.height;
				const imageAspect = naturalDimensions.width / naturalDimensions.height;

				let renderedWidth: number;
				let renderedHeight: number;

				if (containerAspect > imageAspect) {
					// Container is wider - height fits, width letterboxes
					renderedHeight = containerRect.height;
					renderedWidth = containerRect.height * imageAspect;
				} else {
					// Container is taller - width fits, height letterboxes
					renderedWidth = containerRect.width;
					renderedHeight = containerRect.width / imageAspect;
				}

				// Calculate padding offset (image is centered with object-contain)
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

	// Auto-skip to next frame when error occurs - instant, no delay
	useEffect(() => {
		if (hasError && !isLoading && onFrameUnavailable) {
			// Minimal delay just to batch multiple errors
			const timer = setTimeout(() => {
				onFrameUnavailable();
			}, 50);
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
			{imageUrl && (
				<img
					src={imageUrl}
					ref={imageRef}
					className="absolute inset-0 w-full h-full object-contain bg-black"
					style={{
						zIndex: 1,
						display: hasError ? 'none' : 'block',
						opacity: isLoading ? 0 : 1,
						transition: 'opacity 0.15s ease-in-out',
					}}
					alt="Current frame"
					draggable={false}
					onLoad={(e) => {
						const img = e.target as HTMLImageElement;
						console.log('Image loaded successfully for frame:', debouncedFrameId);
						setIsLoading(false);
						setHasError(false);
						setNaturalDimensions({
							width: img.naturalWidth,
							height: img.naturalHeight,
						});
						
						// Track successful frame load time
						if (frameLoadStartTimeRef.current !== null) {
							const loadTime = performance.now() - frameLoadStartTimeRef.current;
							posthog.capture("timeline_frame_load_time", {
								duration_ms: Math.round(loadTime),
								frame_id: debouncedFrameId,
								success: true,
								frames_skipped: framesSkippedRef.current,
								image_width: img.naturalWidth,
								image_height: img.naturalHeight,
							});
							frameLoadStartTimeRef.current = null;
							framesSkippedRef.current = 0;
						}
					}}
					onError={() => {
						console.log('Image failed to load for frame:', debouncedFrameId);
						setIsLoading(false);
						setHasError(true);
					}}
				/>
			)}
			{/* Text selection overlay for timeline view */}
			{/* Position overlay to match the actual rendered image (object-contain letterboxing) */}
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
							// For object-contain, offsets are positive when letterboxed
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
			{/* When frame is unavailable, just show skeleton - skip happens silently */}
			{hasError && !isLoading && (
				<div className="absolute inset-0 z-10">
					<SkeletonLoader />
				</div>
			)}
		</div>
	);
};
