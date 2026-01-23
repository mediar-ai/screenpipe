import { useState, useEffect, useCallback, useRef } from "react";

export interface TextBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface TextPosition {
	text: string;
	confidence: number;
	bounds: TextBounds;
}

export interface FrameOcrResponse {
	frame_id: number;
	text_positions: TextPosition[];
}

interface UseFrameOcrDataOptions {
	/** Whether to automatically fetch OCR data when frameId changes */
	autoFetch?: boolean;
	/** Cache size limit (number of frames to cache) */
	cacheSize?: number;
}

interface UseFrameOcrDataReturn {
	/** OCR text positions for the current frame */
	textPositions: TextPosition[];
	/** Whether data is currently being fetched */
	isLoading: boolean;
	/** Error message if fetch failed */
	error: string | null;
	/** Manually trigger a fetch for the current frame */
	refetch: () => Promise<void>;
}

// Simple LRU cache for OCR data
class OcrCache {
	private cache = new Map<number, TextPosition[]>();
	private maxSize: number;

	constructor(maxSize: number = 50) {
		this.maxSize = maxSize;
	}

	get(frameId: number): TextPosition[] | undefined {
		const value = this.cache.get(frameId);
		if (value !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(frameId);
			this.cache.set(frameId, value);
		}
		return value;
	}

	set(frameId: number, positions: TextPosition[]): void {
		if (this.cache.has(frameId)) {
			this.cache.delete(frameId);
		} else if (this.cache.size >= this.maxSize) {
			// Remove oldest entry (first item in Map)
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(frameId, positions);
	}

	clear(): void {
		this.cache.clear();
	}
}

// Shared cache instance across all hook instances
const globalOcrCache = new OcrCache(100);

/**
 * Hook to fetch and cache OCR text positions for a frame.
 * Enables text selection overlay on screenshots.
 */
export function useFrameOcrData(
	frameId: number | null,
	options: UseFrameOcrDataOptions = {}
): UseFrameOcrDataReturn {
	const { autoFetch = true } = options;

	const [textPositions, setTextPositions] = useState<TextPosition[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Track the last fetched frameId to avoid duplicate requests
	const lastFetchedRef = useRef<number | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	const fetchOcrData = useCallback(async () => {
		if (frameId === null) {
			setTextPositions([]);
			setError(null);
			return;
		}

		// Check cache first
		const cached = globalOcrCache.get(frameId);
		if (cached !== undefined) {
			setTextPositions(cached);
			setError(null);
			setIsLoading(false);
			return;
		}

		// Abort any in-flight request
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}

		const controller = new AbortController();
		abortControllerRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`http://localhost:3030/frames/${frameId}/ocr`,
				{ signal: controller.signal }
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || `HTTP ${response.status}: Failed to fetch OCR data`
				);
			}

			const data: FrameOcrResponse = await response.json();

			// Cache the result
			globalOcrCache.set(frameId, data.text_positions);

			// Only update state if this is still the current request
			if (!controller.signal.aborted) {
				setTextPositions(data.text_positions);
				lastFetchedRef.current = frameId;
			}
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				// Request was aborted, don't update state
				return;
			}

			const errorMessage =
				err instanceof Error ? err.message : "Failed to fetch OCR data";

			if (!controller.signal.aborted) {
				setError(errorMessage);
				setTextPositions([]);
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [frameId]);

	// Auto-fetch when frameId changes
	useEffect(() => {
		if (autoFetch && frameId !== null && frameId !== lastFetchedRef.current) {
			fetchOcrData();
		}

		// Cleanup: abort request on unmount
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, [frameId, autoFetch, fetchOcrData]);

	// Reset state when frameId becomes null
	useEffect(() => {
		if (frameId === null) {
			setTextPositions([]);
			setError(null);
			setIsLoading(false);
			lastFetchedRef.current = null;
		}
	}, [frameId]);

	return {
		textPositions,
		isLoading,
		error,
		refetch: fetchOcrData,
	};
}

/**
 * Utility to clear the global OCR cache.
 * Useful when frame data might have changed.
 */
export function clearOcrCache(): void {
	globalOcrCache.clear();
}
