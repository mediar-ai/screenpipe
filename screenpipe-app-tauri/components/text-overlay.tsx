"use client";

import { useCallback, useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

/**
 * Check if a string looks like a URL.
 * Matches http(s)://, www., and common domain patterns.
 */
export function isUrl(text: string): boolean {
	const trimmed = text.trim();

	// Check for explicit protocol
	if (/^https?:\/\//i.test(trimmed)) {
		return true;
	}

	// Check for www prefix
	if (/^www\./i.test(trimmed)) {
		return true;
	}

	// Check for domain-like patterns (word.tld or word.word.tld)
	// Common TLDs
	const tldPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.(com|org|net|io|dev|app|co|ai|edu|gov|info|biz|me|tv|uk|de|fr|jp|au|ca|nl|ru|br|es|it|ch|se|no|at|be|dk|fi|nz|za|mx|kr|tw|hk|sg|id|tr|xyz|online|site|tech|store|blog|cloud|page|link|click|space|fun|live|news|world|email|today|top|pro|club|shop|website)(\/.*)?$/i;

	return tldPattern.test(trimmed);
}

/**
 * Normalize a URL for opening (add protocol if missing)
 */
export function normalizeUrl(url: string): string {
	const trimmed = url.trim();
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	if (trimmed.startsWith("www.")) {
		return `https://${trimmed}`;
	}
	// If it looks like a domain, add https
	return `https://${trimmed}`;
}

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
	/** Whether to make URLs clickable */
	clickableUrls?: boolean;
}

interface ScaledTextPosition extends TextPosition {
	scaledBounds: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

interface ScaledTextPositionWithUrl extends ScaledTextPosition {
	isUrl: boolean;
	normalizedUrl?: string;
}

/**
 * TextOverlay renders transparent, selectable text positioned over a screenshot.
 * This enables native text selection (Cmd+C / Ctrl+C) on OCR-extracted text.
 * URLs are automatically detected and made clickable.
 *
 * NOTE: Currently disabled due to buggy text selection experience.
 * TODO: Re-enable once text selection UX is improved.
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
	clickableUrls = true,
}: TextOverlayProps) {
	// TEMPORARILY DISABLED: Text selection is buggy, disable for now
	const isDisabled = true;

	// Scale and filter text positions, detect URLs
	// Note: OCR bounds are normalized (0-1 range), so we multiply directly by displayed dimensions
	const scaledPositions = useMemo<ScaledTextPositionWithUrl[]>(() => {
		if (!displayedWidth || !displayedHeight) {
			return [];
		}

		return textPositions
			.filter((pos) => pos.confidence >= minConfidence)
			.map((pos) => {
				const textIsUrl = isUrl(pos.text);
				return {
					...pos,
					scaledBounds: {
						left: pos.bounds.left * displayedWidth,
						top: pos.bounds.top * displayedHeight,
						width: pos.bounds.width * displayedWidth,
						height: pos.bounds.height * displayedHeight,
					},
					isUrl: textIsUrl,
					normalizedUrl: textIsUrl ? normalizeUrl(pos.text) : undefined,
				};
			})
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
		displayedWidth,
		displayedHeight,
		minConfidence,
	]);

	// Calculate font size based on scaled height
	const getFontSize = useCallback((height: number): number => {
		// Use 90% of the height as font size for better alignment
		return Math.max(8, height * 0.9);
	}, []);

	const handleUrlClick = useCallback((url: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		window.open(url, "_blank", "noopener,noreferrer");
	}, []);

	// Early return for disabled state (must be after all hooks)
	if (isDisabled) {
		return null;
	}

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
			{scaledPositions.map((pos, index) => {
				const isClickableUrl = clickableUrls && pos.isUrl && pos.normalizedUrl;

				if (isClickableUrl) {
					return (
						<a
							key={`${index}-${pos.text.slice(0, 10)}`}
							href={pos.normalizedUrl}
							onClick={(e) => handleUrlClick(pos.normalizedUrl!, e)}
							className={cn(
								"absolute whitespace-pre leading-none",
								debug
									? "border border-blue-500/50 bg-blue-500/20 text-blue-600"
									: "text-transparent hover:text-blue-500/70 hover:underline"
							)}
							style={{
								left: pos.scaledBounds.left,
								top: pos.scaledBounds.top,
								width: pos.scaledBounds.width,
								height: pos.scaledBounds.height,
								fontSize: getFontSize(pos.scaledBounds.height),
								lineHeight: `${pos.scaledBounds.height}px`,
								cursor: "pointer",
								textDecoration: "none",
							}}
							title={debug ? `URL: ${pos.normalizedUrl}` : `Open ${pos.normalizedUrl}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							{pos.text}
						</a>
					);
				}

				return (
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
							userSelect: "text",
							WebkitUserSelect: "text",
							cursor: "text",
						}}
						title={debug ? `Confidence: ${(pos.confidence * 100).toFixed(1)}%` : undefined}
					>
						{pos.text}
					</span>
				);
			})}
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
