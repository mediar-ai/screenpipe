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
	/** all unique device_ids seen in this session (e.g. ["monitor_1", "monitor_4"]) */
	allDeviceIds?: string[];
}

/**
 * Parse a device_id like "monitor_4" → "4" or "louis-macbook/monitor_1" → "macbook · 1"
 */
function formatDeviceLabel(deviceId: string): string {
	// cloud sync format: "hostname/monitor_N"
	if (deviceId.includes("/")) {
		const [host, monitor] = deviceId.split("/");
		const shortHost = host.replace(/^[^-]*-/, ""); // "louis-macbook" → "macbook"
		const num = monitor.replace(/\D/g, "");
		return `${shortHost} · ${num}`;
	}
	// local format: "monitor_N"
	const num = deviceId.replace(/\D/g, "");
	return num || deviceId;
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

// Track which chunks have failed with TTL — entries expire so finished chunks can be retried
const FAILED_CHUNK_TTL_MS = 30_000;
const failedChunks = new Map<string, number>();

function isChunkFailed(path: string): boolean {
	const t = failedChunks.get(path);
	if (t === undefined) return false;
	if (Date.now() - t > FAILED_CHUNK_TTL_MS) {
		failedChunks.delete(path);
		return false;
	}
	return true;
}

function markChunkFailed(path: string): void {
	failedChunks.set(path, Date.now());
}

// Cache calibrated fps per video file path so we only compute once
const calibratedFpsCache = new Map<string, number>();





export const CurrentFrameTimeline: FC<CurrentFrameTimelineProps> = ({
	currentFrame,
	onNavigate,
	canNavigatePrev = true,
	canNavigateNext = true,
	onFrameUnavailable,
	onFrameLoadError,
	onUrlsDetected,
	allDeviceIds,
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
	// Try video mode first on all platforms; onError fallback handles unsupported codecs
	const [useVideoMode, setUseVideoMode] = useState(true);
	// Successfully preloaded fallback image URL — only updated on load success
	const [displayedFallbackUrl, setDisplayedFallbackUrl] = useState<string | null>(null);
	// Debounced frame — only updates after scroll settles
	const [debouncedFrame, setDebouncedFrame] = useState<{
		filePath: string;
		offsetIndex: number;
		fps: number;
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
	// Canvas for snapshotting last good frame (back buffer for crossfades)
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// Controls crossfade: false during chunk transitions, true when frame is ready
	const [frameReady, setFrameReady] = useState(true);

	const device = currentFrame?.devices?.[0];
	const frameId = device?.frame_id;
	const filePath = device?.metadata?.file_path;
	const offsetIndex = device?.offset_index ?? 0;
	const fpsFromServer = device?.fps ?? 0.5;

	// monitor pill — only show when session has multiple monitors
	const deviceId = device?.device_id;
	const showMonitorPill = Boolean(
		deviceId && allDeviceIds && allDeviceIds.length > 1
	);
	const monitorLabel = deviceId ? formatDeviceLabel(deviceId) : "";

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

	// Resolve the effective fps for a chunk: validate server value, or auto-calibrate from video duration.
	// Pre-migration chunks default to 0.5 which may be wrong (e.g., CLI uses 1.0).
	// The sanity check catches this and recalibrates.
	const resolveEffectiveFps = useCallback((
		path: string,
		serverFps: number,
		video: HTMLVideoElement,
		offsetIndex: number,
	): number | null => {
		// 1. Check calibration cache first (from a previous correction)
		const cached = calibratedFpsCache.get(path);
		if (cached !== undefined) return cached;

		// 2. Validate server fps against video duration
		if (serverFps > 0) {
			const expectedTime = offsetIndex / serverFps;
			if (expectedTime <= video.duration + 0.5) {
				return serverFps; // looks valid
			}
			// Server fps is wrong (seek would overshoot) — fall through to calibration
			console.warn(`fps ${serverFps} invalid for offset ${offsetIndex}: would seek to ${expectedTime.toFixed(1)}s but video is ${video.duration.toFixed(1)}s`);
		}

		// 3. Auto-calibrate from video duration
		const duration = video.duration;
		if (duration <= 0 || !isFinite(duration)) return null;

		// Try common fps values: 0.2, 0.5, 1.0, 2.0
		const commonFps = [0.2, 0.5, 1.0, 2.0];
		for (const candidate of commonFps) {
			const maxOffset = Math.floor(duration * candidate);
			if (offsetIndex < maxOffset) {
				calibratedFpsCache.set(path, candidate);
				console.log(`auto-calibrated fps=${candidate} for ${path} (duration=${duration.toFixed(1)}s, offset=${offsetIndex})`);
				return candidate;
			}
		}

		// Last resort: derive directly
		const derived = (offsetIndex + 1) / duration;
		calibratedFpsCache.set(path, derived);
		console.log(`derived fps=${derived.toFixed(3)} for ${path} (duration=${duration.toFixed(1)}s, offset=${offsetIndex})`);
		return derived;
	}, []);

	// Snapshot the current visible frame onto the canvas back buffer.
	// Called after every successful seek and before chunk transitions.
	const snapshotToCanvas = useCallback((source?: CanvasImageSource, w?: number, h?: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		if (source && w && h) {
			canvas.width = w;
			canvas.height = h;
			ctx.drawImage(source, 0, 0, w, h);
			return;
		}
		const video = videoRef.current;
		if (video && video.videoWidth > 0 && video.readyState >= 2) {
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			ctx.drawImage(video, 0, 0);
		}
	}, []);

	// Main video seeking effect
	useEffect(() => {
		if (!debouncedFrame || !useVideoMode) return;
		const { filePath: path, offsetIndex: idx, fps: serverFps, frameId: fid } = debouncedFrame;

		// If this chunk previously failed, go straight to fallback
		if (isChunkFailed(path)) {
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
				// Snapshot current frame before switching (canvas holds it during transition)
				snapshotToCanvas();
				setFrameReady(false);

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

			// Frame is ready — snapshot to canvas and crossfade in
			snapshotToCanvas();
			setFrameReady(true);
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
					fps_source: calibratedFpsCache.has(path) ? "calibrated" : "server",
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
			setFrameReady(false);
			markChunkFailed(path);
			loadedChunkRef.current = null;
			setUseVideoMode(false);
		});
	}, [debouncedFrame, useVideoMode, getVideoUrl, resolveEffectiveFps, snapshotToCanvas]);

	// Fallback: ffmpeg <img> mode (same as old behavior)
	const fallbackImageUrl = useMemo(() => {
		if (useVideoMode || !debouncedFrame) return null;
		return `http://localhost:3030/frames/${debouncedFrame.frameId}`;
	}, [useVideoMode, debouncedFrame]);

	// Preload fallback image — only swap displayed URL when the new image loads successfully
	useEffect(() => {
		if (!fallbackImageUrl) return;
		frameLoadStartTimeRef.current = performance.now();
		const img = new Image();
		img.onload = () => {
			snapshotToCanvas(img, img.naturalWidth, img.naturalHeight);
			setFrameReady(true);
			setDisplayedFallbackUrl(fallbackImageUrl);
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
		};
		img.onerror = () => {
			// Preload failed — keep showing previous image
			setIsLoading(false);
		};
		img.src = fallbackImageUrl;
		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [fallbackImageUrl, snapshotToCanvas]);

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
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(updateDimensions);
		observer.observe(el);
		return () => observer.disconnect();
	}, [naturalDimensions]);

	// Re-enable video mode when navigating to a non-failed chunk
	useEffect(() => {
		if (debouncedFrame?.filePath && !isChunkFailed(debouncedFrame.filePath)) {
			setUseVideoMode(true);
		}
	}, [debouncedFrame?.filePath]);

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
			{/* Canvas snapshot — back buffer holding last good frame for crossfades */}
			<div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
				<canvas ref={canvasRef} className="max-w-full max-h-full" />
			</div>

			{/* Video element — crossfades in over canvas when frame is ready */}
			<video
				ref={videoRef}
				muted
				playsInline
				preload="auto"
				className="absolute inset-0 w-full h-full object-contain"
				style={{
					zIndex: 1,
					opacity: frameReady ? 1 : 0,
					transition: "opacity 150ms ease-out",
				}}
				onError={() => {
					const err = videoRef.current?.error;
					console.warn("Video error:", err?.code, err?.message);
					setFrameReady(false);
					if (debouncedFrame?.filePath) {
						markChunkFailed(debouncedFrame.filePath);
					}
					loadedChunkRef.current = null;
					setUseVideoMode(false);
				}}
			/>

			{/* Fallback mode: preloaded <img> layered on top of frozen video frame */}
			{displayedFallbackUrl && !useVideoMode && (
				<img
					src={displayedFallbackUrl}
					className="absolute inset-0 w-full h-full object-contain"
					style={{
						zIndex: 2,
						opacity: frameReady ? 1 : 0,
						transition: "opacity 150ms ease-out",
					}}
					alt="Current frame"
					draggable={false}
				/>
			)}

			{/* monitor indicator pill */}
			{showMonitorPill && !isLoading && !hasError && (
				<div className="absolute top-2 right-2 z-20 px-1.5 py-0.5 text-[10px] font-mono bg-black/60 text-white/70 rounded-sm select-none pointer-events-none">
					{monitorLabel}
				</div>
			)}

			{/* OCR text overlay */}
			{!isLoading && !hasError && !ocrLoading && naturalDimensions && renderedImageInfo && textPositions.length > 0 && (
				<div className="absolute overflow-hidden" style={{ zIndex: 3, top: 0, left: 0, right: 0, bottom: 0 }}>
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

		</div>
	);
};
