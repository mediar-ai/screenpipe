import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFrameOcrData } from "@/lib/hooks/use-frame-ocr-data";
import { TextOverlay, extractUrlsFromText, isUrl, normalizeUrl } from "@/components/text-overlay";
import { ImageOff, ChevronLeft, ChevronRight } from "lucide-react";
import posthog from "posthog-js";

export interface DetectedUrl {
	normalized: string;
	display: string;
}

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
	onNavigate?: (direction: "prev" | "next") => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
	onFrameUnavailable?: () => void;
	onFrameLoadError?: () => void;
	onUrlsDetected?: (urls: DetectedUrl[]) => void;
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
const FRAME_LOAD_DEBOUNCE_MS = 80;

// Track which chunks have failed so we don't retry them
const failedChunks = new Set<string>();

// Cache calibrated fps per video file path so we only compute once
const calibratedFpsCache = new Map<string, number>();

// Only macOS WebKit can decode HEVC natively — Windows/Linux webviews cannot
const isMacOS = typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
const canUseVideoSeek = isMacOS;

export const CurrentFrameTimeline: FC<CurrentFrameTimelineProps> = ({
	currentFrame,
	onNavigate,
	canNavigatePrev = true,
	canNavigateNext = true,
	onFrameUnavailable,
	onFrameLoadError,
	onUrlsDetected,
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [naturalDimensions, setNaturalDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const [renderedImageInfo, setRenderedImageInfo] = useState<{
		width: number;
		height: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);

	// Whether to use <video> seeking or fall back to <img> via ffmpeg
	// Only macOS WebKit supports HEVC; Windows (WebView2) and Linux (WebKitGTK) do not
	const [useVideoMode, setUseVideoMode] = useState(canUseVideoSeek);
	// Debounced frame — only updates after scroll settles
	const [debouncedFrame, setDebouncedFrame] = useState<{
		filePath: string;
		offsetIndex: number;
		fps: number | null;
		frameId: string;
	} | null>(null);

	const videoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const frameLoadStartTimeRef = useRef<number | null>(null);
	const framesSkippedRef = useRef<number>(0);
	const lastFrameIdRef = useRef<string | null>(null);
	// Track currently loaded video chunk to avoid reloading same file
	const loadedChunkRef = useRef<string | null>(null);
	// Generation counter to discard stale events
	const seekGenRef = useRef(0);

	const device = currentFrame?.devices?.[0];
	const frameId = device?.frame_id;
	const filePath = device?.metadata?.file_path;
	const offsetIndex = device?.offset_index ?? 0;
	const fpsFromServer = device?.fps ?? null; // null = pre-migration chunk

	// Track skipped frames for analytics
	useEffect(() => {
		if (frameId && lastFrameIdRef.current && frameId !== lastFrameIdRef.current) {
			if (frameLoadStartTimeRef.current !== null) {
				framesSkippedRef.current += 1;
			}
		}
		lastFrameIdRef.current = frameId;
	}, [frameId]);

	// Debounce frame changes
	useEffect(() => {
		if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		if (!frameId || !filePath) {
			setDebouncedFrame(null);
			return;
		}
		setIsLoading(true);
		debounceTimerRef.current = setTimeout(() => {
			setDebouncedFrame({ filePath, offsetIndex, fps: fpsFromServer, frameId });
		}, FRAME_LOAD_DEBOUNCE_MS);
		return () => {
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		};
	}, [frameId, filePath, offsetIndex, fpsFromServer]);

	// Convert file path to asset URL
	const getVideoUrl = useCallback(async (path: string): Promise<string | null> => {
		try {
			const { convertFileSrc } = await import("@tauri-apps/api/core");
			return convertFileSrc(path);
		} catch {
			return null;
		}
	}, []);

	// Resolve the effective fps for a chunk: use server value, cached calibration, or compute from video
	const resolveEffectiveFps = useCallback((
		path: string,
		serverFps: number | null,
		video: HTMLVideoElement,
		offsetIndex: number,
	): number | null => {
		// 1. If server provided fps, validate it against video duration
		if (serverFps !== null && serverFps > 0) {
			const expectedTime = offsetIndex / serverFps;
			if (expectedTime <= video.duration + 0.5) {
				return serverFps; // looks valid
			}
			// Server fps is wrong (seek would overshoot) — fall through to calibration
			console.warn(`fps ${serverFps} invalid for offset ${offsetIndex}: would seek to ${expectedTime.toFixed(1)}s but video is ${video.duration.toFixed(1)}s`);
		}

		// 2. Check calibration cache
		const cached = calibratedFpsCache.get(path);
		if (cached !== undefined) return cached;

		// 3. Auto-calibrate: estimate fps from video duration
		// At constant fps, video duration ≈ (totalFrames - 1) / fps + 1/fps = totalFrames / fps
		// We don't know totalFrames here, but we can bound it:
		// - If offsetIndex is the highest we'll see in this chunk, fps ≈ (offsetIndex + 1) / duration
		// - We use a conservative estimate since offsetIndex may not be the max
		// For now, we try common fps values and pick the one where all offsets fit
		const duration = video.duration;
		if (duration <= 0 || !isFinite(duration)) return null;

		// Try common fps values: 0.2, 0.5, 1.0, 2.0
		const commonFps = [0.2, 0.5, 1.0, 2.0];
		for (const candidate of commonFps) {
			// At this fps, max frames in this video = floor(duration * candidate)
			// offset_index should be < maxFrames
			const maxOffset = Math.floor(duration * candidate);
			if (offsetIndex < maxOffset) {
				calibratedFpsCache.set(path, candidate);
				console.log(`auto-calibrated fps=${candidate} for ${path} (duration=${duration.toFixed(1)}s, offset=${offsetIndex})`);
				return candidate;
			}
		}

		// Last resort: derive directly
		// Assume at least offsetIndex+1 frames exist, so fps ≈ (offsetIndex + 1) / duration
		const derived = (offsetIndex + 1) / duration;
		calibratedFpsCache.set(path, derived);
		console.log(`derived fps=${derived.toFixed(3)} for ${path} (duration=${duration.toFixed(1)}s, offset=${offsetIndex})`);
		return derived;
	}, []);

	// Main video seeking effect
	useEffect(() => {
		if (!debouncedFrame || !useVideoMode) return;
		const { filePath: path, offsetIndex: idx, fps: serverFps, frameId: fid } = debouncedFrame;

		// If this chunk previously failed, go straight to fallback
		if (failedChunks.has(path)) {
			setUseVideoMode(false);
			return;
		}

		const gen = ++seekGenRef.current;
		frameLoadStartTimeRef.current = performance.now();

		const doSeek = async () => {
			const video = videoRef.current;
			if (!video) return;

			// Load new chunk if needed
			if (loadedChunkRef.current !== path) {
				const url = await getVideoUrl(path);
				if (!url || gen !== seekGenRef.current) return;
				
				loadedChunkRef.current = path;
				video.src = url;
				video.load();

				// Wait for loadeddata (need duration for calibration)
				await new Promise<void>((resolve, reject) => {
					const onLoaded = () => {
						video.removeEventListener("loadeddata", onLoaded);
						video.removeEventListener("error", onError);
						resolve();
					};
					const onError = () => {
						video.removeEventListener("loadeddata", onLoaded);
						video.removeEventListener("error", onError);
						reject(new Error("video load failed"));
					};
					if (video.readyState >= 2) {
						resolve();
						return;
					}
					video.addEventListener("loadeddata", onLoaded);
					video.addEventListener("error", onError);
				});
			}

			if (gen !== seekGenRef.current) return;

			// Resolve effective fps (auto-calibrate if needed)
			const effectiveFps = resolveEffectiveFps(path, serverFps, video, idx);
			if (effectiveFps === null || effectiveFps <= 0) {
				throw new Error(`cannot determine fps for ${path}`);
			}

			// Seek to frame with bounds check
			let targetTime = idx / effectiveFps;
			// Clamp to video duration (safety net)
			if (targetTime > video.duration) {
				console.warn(`seek target ${targetTime.toFixed(1)}s > duration ${video.duration.toFixed(1)}s, clamping`);
				targetTime = Math.max(0, video.duration - 0.01);
			}

			if (Math.abs(video.currentTime - targetTime) > 0.001) {
				video.currentTime = targetTime;
				await new Promise<void>((resolve) => {
					const onSeeked = () => {
						video.removeEventListener("seeked", onSeeked);
						resolve();
					};
					video.addEventListener("seeked", onSeeked);
				});
			}

			if (gen !== seekGenRef.current) return;

			// Frame is ready
			setIsLoading(false);
			setHasError(false);
			setNaturalDimensions({
				width: video.videoWidth,
				height: video.videoHeight,
			});

			// Analytics
			if (frameLoadStartTimeRef.current !== null) {
				const loadTime = performance.now() - frameLoadStartTimeRef.current;
				posthog.capture("timeline_frame_load_time", {
					duration_ms: Math.round(loadTime),
					frame_id: fid,
					success: true,
					mode: "video_seek",
					fps_source: serverFps !== null ? "server" : "calibrated",
					effective_fps: effectiveFps,
					frames_skipped: framesSkippedRef.current,
					image_width: video.videoWidth,
					image_height: video.videoHeight,
				});
				frameLoadStartTimeRef.current = null;
				framesSkippedRef.current = 0;
			}
		};

		doSeek().catch((err) => {
			if (gen !== seekGenRef.current) return;
			console.warn("Video seek failed, falling back to ffmpeg:", err);
			failedChunks.add(path);
			loadedChunkRef.current = null;
			setUseVideoMode(false);
		});
	}, [debouncedFrame, useVideoMode, getVideoUrl, resolveEffectiveFps]);

	// Fallback: ffmpeg <img> mode (same as old behavior)
	const fallbackImageUrl = useMemo(() => {
		if (useVideoMode || !debouncedFrame) return null;
		return `http://localhost:3030/frames/${debouncedFrame.frameId}`;
	}, [useVideoMode, debouncedFrame]);

	// Handle fallback image load
	const imgRef = useRef<HTMLImageElement>(null);
	useEffect(() => {
		if (!fallbackImageUrl) return;
		frameLoadStartTimeRef.current = performance.now();
		const controller = new AbortController();

		fetch(fallbackImageUrl, { signal: controller.signal })
			.then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
			.catch(err => {
				if (err.name !== "AbortError") {
					setHasError(true);
					setIsLoading(false);
					onFrameLoadError?.();
				}
			});

		return () => controller.abort();
	}, [fallbackImageUrl]);

	// OCR data
	const { textPositions, isLoading: ocrLoading } = useFrameOcrData(
		debouncedFrame ? parseInt(debouncedFrame.frameId, 10) : null
	);

	const ocrFrameIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!ocrLoading && debouncedFrame) ocrFrameIdRef.current = debouncedFrame.frameId;
	}, [ocrLoading, debouncedFrame]);

	const detectedUrls = useMemo(() => {
		if (ocrLoading) return [];
		const urls = new Map<string, string>();
		for (const pos of textPositions) {
			const b = pos.bounds;
			if (b.left < 0 || b.top < 0 || b.left > 1 || b.top > 1) continue;
			if (isUrl(pos.text)) {
				const norm = normalizeUrl(pos.text);
				if (norm.length >= 12 && !urls.has(norm)) urls.set(norm, pos.text);
				continue;
			}
			for (const ext of extractUrlsFromText(pos.text)) {
				if (ext.normalizedUrl.length >= 12 && !urls.has(ext.normalizedUrl)) {
					urls.set(ext.normalizedUrl, ext.url);
				}
			}
		}
		return Array.from(urls.entries())
			.map(([normalized, display]) => ({ normalized, display }))
			.slice(0, 3);
	}, [textPositions, ocrLoading]);

	useEffect(() => { onUrlsDetected?.(detectedUrls); }, [detectedUrls, onUrlsDetected]);

	// Update rendered dimensions on resize
	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current && naturalDimensions) {
				const containerRect = containerRef.current.getBoundingClientRect();
				const containerAspect = containerRect.width / containerRect.height;
				const imageAspect = naturalDimensions.width / naturalDimensions.height;
				let renderedWidth: number, renderedHeight: number;
				if (containerAspect > imageAspect) {
					renderedHeight = containerRect.height;
					renderedWidth = containerRect.height * imageAspect;
				} else {
					renderedWidth = containerRect.width;
					renderedHeight = containerRect.width / imageAspect;
				}
				setRenderedImageInfo({
					width: renderedWidth,
					height: renderedHeight,
					offsetX: (containerRect.width - renderedWidth) / 2,
					offsetY: (containerRect.height - renderedHeight) / 2,
				});
			}
		};
		updateDimensions();
		window.addEventListener("resize", updateDimensions);
		return () => window.removeEventListener("resize", updateDimensions);
	}, [naturalDimensions]);

	// Auto-skip on error
	useEffect(() => {
		if (hasError && !isLoading && onFrameUnavailable) {
			const timer = setTimeout(() => onFrameUnavailable(), 50);
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
									<button onClick={() => onNavigate("prev")} disabled={!canNavigatePrev}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed border border-border text-foreground text-sm font-mono uppercase transition-colors">
										<ChevronLeft className="w-4 h-4" /> Previous
									</button>
									<button onClick={() => onNavigate("next")} disabled={!canNavigateNext}
										className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed border border-border text-foreground text-sm font-mono uppercase transition-colors">
										Next <ChevronRight className="w-4 h-4" />
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

			{/* Video mode: <video> element with seeking */}
			{useVideoMode && (
				<video
					ref={videoRef}
					muted
					playsInline
					preload="auto"
					className="absolute inset-0 w-full h-full object-contain bg-black"
					style={{
						zIndex: 1,
						opacity: isLoading ? 0 : 1,
						transition: "opacity 0.1s ease-in-out",
					}}
					onError={() => {
						const err = videoRef.current?.error;
						console.warn("Video error:", err?.code, err?.message);
						if (debouncedFrame?.filePath) {
							failedChunks.add(debouncedFrame.filePath);
						}
						loadedChunkRef.current = null;
						setUseVideoMode(false);
					}}
				/>
			)}

			{/* Fallback mode: <img> via ffmpeg extraction */}
			{!useVideoMode && fallbackImageUrl && (
				<img
					ref={imgRef}
					src={fallbackImageUrl}
					className="absolute inset-0 w-full h-full object-contain bg-black"
					style={{
						zIndex: 1,
						display: hasError ? "none" : "block",
						opacity: isLoading ? 0 : 1,
						transition: "opacity 0.15s ease-in-out",
					}}
					alt="Current frame"
					draggable={false}
					onLoad={(e) => {
						const img = e.target as HTMLImageElement;
						setIsLoading(false);
						setHasError(false);
						setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
						if (frameLoadStartTimeRef.current !== null) {
							const loadTime = performance.now() - frameLoadStartTimeRef.current;
							posthog.capture("timeline_frame_load_time", {
								duration_ms: Math.round(loadTime),
								frame_id: debouncedFrame?.frameId,
								success: true,
								mode: "ffmpeg_fallback",
								frames_skipped: framesSkippedRef.current,
							});
							frameLoadStartTimeRef.current = null;
							framesSkippedRef.current = 0;
						}
					}}
					onError={() => {
						setIsLoading(false);
						setHasError(true);
					}}
				/>
			)}

			{/* OCR text overlay */}
			{!isLoading && !hasError && !ocrLoading && naturalDimensions && renderedImageInfo && textPositions.length > 0 && (
				<div className="absolute overflow-hidden" style={{ zIndex: 2, top: 0, left: 0, right: 0, bottom: 0 }}>
					<div style={{
						position: "absolute",
						left: renderedImageInfo.offsetX,
						top: renderedImageInfo.offsetY,
						width: renderedImageInfo.width,
						height: renderedImageInfo.height,
					}}>
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

			{hasError && !isLoading && (
				<div className="absolute inset-0 z-10"><SkeletonLoader /></div>
			)}
		</div>
	);
};
