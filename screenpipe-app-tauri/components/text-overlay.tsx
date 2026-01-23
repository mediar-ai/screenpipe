"use client";

import { useCallback, useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

interface TextOverlayProps {
	/** OCR text positions with bounding boxes */
	textPositions: TextPosition[];
	/** Original image width in pixels (from OCR) */
	originalWidth: number;
	/** Original image height in pixels (from OCR) */
	originalHeight: number;
	/** Displayed image width in pixels */
	displayedWidth: number;
	/** Displayed image height in pixels */
	displayedHeight: number;
	/** Optional className for the container */
	className?: string;
	/** Minimum confidence threshold (0-100) to display text */
	minConfidence?: number;
	/** Whether to show debug borders around text blocks */
	debug?: boolean;
}

interface ScaledTextPosition extends TextPosition {
	scaledBounds: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

/**
 * TextOverlay renders transparent, selectable text positioned over a screenshot.
 * This enables native text selection (Cmd+C / Ctrl+C) on OCR-extracted text.
 */
export const TextOverlay = memo(function TextOverlay({
	textPositions,
	originalWidth,
	originalHeight,
	displayedWidth,
	displayedHeight,
	className,
	minConfidence = -1,
	debug = false,
}: TextOverlayProps) {
	// Calculate scale factors between original and displayed image
	const scaleX = displayedWidth / originalWidth;
	const scaleY = displayedHeight / originalHeight;

	// Scale and filter text positions
	const scaledPositions = useMemo<ScaledTextPosition[]>(() => {
		if (!originalWidth || !originalHeight || !displayedWidth || !displayedHeight) {
			return [];
		}

		return textPositions
			.filter((pos) => pos.confidence >= minConfidence)
			.map((pos) => ({
				...pos,
				scaledBounds: {
					left: pos.bounds.left * scaleX,
					top: pos.bounds.top * scaleY,
					width: pos.bounds.width * scaleX,
					height: pos.bounds.height * scaleY,
				},
			}))
			.filter(
				(pos) =>
					pos.scaledBounds.width > 0 &&
					pos.scaledBounds.height > 0 &&
					pos.scaledBounds.left >= 0 &&
					pos.scaledBounds.top >= 0 &&
					pos.scaledBounds.left + pos.scaledBounds.width <= displayedWidth + 1 &&
					pos.scaledBounds.top + pos.scaledBounds.height <= displayedHeight + 1
			);
	}, [
		textPositions,
		originalWidth,
		originalHeight,
		displayedWidth,
		displayedHeight,
		scaleX,
		scaleY,
		minConfidence,
	]);

	// Calculate font size based on scaled height
	const getFontSize = useCallback((height: number): number => {
		// Use 90% of the height as font size for better alignment
		return Math.max(8, height * 0.9);
	}, []);

	if (scaledPositions.length === 0) {
		return null;
	}

	return (
		<div
			className={cn(
				"absolute inset-0 pointer-events-auto select-text overflow-hidden",
				className
			)}
			style={{
				width: displayedWidth,
				height: displayedHeight,
			}}
		>
			{scaledPositions.map((pos, index) => (
				<span
					key={`${index}-${pos.text.slice(0, 10)}`}
					className={cn(
						"absolute whitespace-pre leading-none",
						debug
							? "border border-red-500/50 bg-red-500/10"
							: "text-transparent"
					)}
					style={{
						left: pos.scaledBounds.left,
						top: pos.scaledBounds.top,
						width: pos.scaledBounds.width,
						height: pos.scaledBounds.height,
						fontSize: getFontSize(pos.scaledBounds.height),
						lineHeight: `${pos.scaledBounds.height}px`,
						// Allow text selection but don't interfere with clicks on empty space
						userSelect: "text",
						WebkitUserSelect: "text",
						cursor: "text",
					}}
					title={debug ? `Confidence: ${(pos.confidence * 100).toFixed(1)}%` : undefined}
				>
					{pos.text}
				</span>
			))}
		</div>
	);
});

/**
 * Props for the TextOverlayWithImage component
 */
interface TextOverlayWithImageProps {
	/** OCR text positions with bounding boxes */
	textPositions: TextPosition[];
	/** Original image dimensions (from backend/OCR) */
	originalDimensions: { width: number; height: number } | null;
	/** Ref callback to get the image element's bounding rect */
	imageRect: DOMRect | null;
	/** Whether the overlay is enabled */
	enabled?: boolean;
	/** Debug mode to visualize text blocks */
	debug?: boolean;
}

/**
 * A wrapper that renders TextOverlay positioned correctly relative to an image.
 * Use this when you have an image ref and want to overlay text on it.
 */
export const TextOverlayForImage = memo(function TextOverlayForImage({
	textPositions,
	originalDimensions,
	imageRect,
	enabled = true,
	debug = false,
}: TextOverlayWithImageProps) {
	if (
		!enabled ||
		!originalDimensions ||
		!imageRect ||
		textPositions.length === 0
	) {
		return null;
	}

	return (
		<TextOverlay
			textPositions={textPositions}
			originalWidth={originalDimensions.width}
			originalHeight={originalDimensions.height}
			displayedWidth={imageRect.width}
			displayedHeight={imageRect.height}
			debug={debug}
		/>
	);
});
