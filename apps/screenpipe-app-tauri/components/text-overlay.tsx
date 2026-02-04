"use client";

import { useCallback, useMemo, memo, useState } from "react";
import { cn } from "@/lib/utils";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

/**
 * Check if a string looks like a URL.
 * Matches http(s)://, www., and domain-like patterns.
 * Uses a permissive TLD check: any 2-13 char alphabetic TLD is accepted
 * because OCR text won't produce false positives like "hello.world"
 * in a screenshot context — the text is already rendered UI.
 */
export function isUrl(text: string): boolean {
	const trimmed = text.trim();

	// Reject if contains spaces (URLs don't have spaces)
	if (/\s/.test(trimmed)) {
		return false;
	}

	// Check for explicit protocol
	if (/^https?:\/\//i.test(trimmed)) {
		return true;
	}

	// Check for www prefix
	if (/^www\./i.test(trimmed)) {
		return true;
	}

	// Check for domain-like patterns: word.tld or sub.word.tld
	// Accept any alphabetic TLD with 2-13 chars (covers .com, .chat, .pe, .website, etc.)
	const domainPattern =
		/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,13}(\/[^\s]*)?$/;

	return domainPattern.test(trimmed);
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

// Minimum click target height in pixels — OCR boxes can be tiny (8-13px)
const MIN_LINK_HEIGHT = 24;
// Extra horizontal padding on each side for easier clicking
const LINK_PADDING_X = 4;

/**
 * TextOverlay renders clickable URL links positioned over a screenshot.
 * URLs are detected from OCR text and rendered as visible, hoverable links.
 * Clicking opens the URL in the system default browser via Tauri shell.
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
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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
					// Allow small overflow (1px tolerance) for rounding
					pos.scaledBounds.left + pos.scaledBounds.width <=
						displayedWidth + 1 &&
					pos.scaledBounds.top + pos.scaledBounds.height <=
						displayedHeight + 1
			);
	}, [textPositions, displayedWidth, displayedHeight, minConfidence]);

	const handleUrlClick = useCallback(
		async (url: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				await shellOpen(url);
			} catch (err) {
				console.error("failed to open URL:", url, err);
				// Fallback: try window.open
				window.open(url, "_blank", "noopener,noreferrer");
			}
		},
		[]
	);

	// Only render URLs (text selection is disabled for now)
	const positionsToRender = scaledPositions.filter(
		(pos) => pos.isUrl && pos.normalizedUrl
	);

	if (positionsToRender.length === 0) {
		return null;
	}

	return (
		<div
			className={cn("absolute inset-0 overflow-hidden", className)}
			style={{
				width: displayedWidth,
				height: displayedHeight,
				pointerEvents: "none",
			}}
		>
			{positionsToRender.map((pos, index) => {
				if (!clickableUrls || !pos.normalizedUrl) return null;

				const isHovered = hoveredIndex === index;

				// Enlarge the click target for small OCR boxes
				const rawH = pos.scaledBounds.height;
				const targetH = Math.max(rawH, MIN_LINK_HEIGHT);
				const extraY = (targetH - rawH) / 2;
				const targetW = pos.scaledBounds.width + LINK_PADDING_X * 2;

				return (
					<a
						key={`${index}-${pos.text.slice(0, 20)}`}
						href={pos.normalizedUrl}
						onClick={(e) => handleUrlClick(pos.normalizedUrl!, e)}
						onMouseEnter={() => setHoveredIndex(index)}
						onMouseLeave={() => setHoveredIndex(null)}
						className="absolute block"
						style={{
							left: pos.scaledBounds.left - LINK_PADDING_X,
							top: pos.scaledBounds.top - extraY,
							width: targetW,
							height: targetH,
							cursor: "pointer",
							pointerEvents: "auto",
							// Visible underline always, highlight on hover
							borderBottom: isHovered
								? "2px solid rgba(96, 165, 250, 0.9)"
								: "2px solid rgba(96, 165, 250, 0.45)",
							backgroundColor: isHovered
								? "rgba(96, 165, 250, 0.15)"
								: "transparent",
							borderRadius: "2px",
							transition:
								"background-color 0.15s, border-color 0.15s",
							// Debug mode
							...(debug
								? {
										border: "1px solid rgba(59, 130, 246, 0.7)",
										backgroundColor:
											"rgba(59, 130, 246, 0.2)",
									}
								: {}),
						}}
						title={`Open ${pos.normalizedUrl}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						{/* Tooltip on hover showing the URL */}
						{isHovered && (
							<span
								className="absolute left-0 whitespace-nowrap text-xs px-2 py-1 rounded shadow-lg border z-50"
								style={{
									bottom: targetH + 4,
									backgroundColor: "rgba(0, 0, 0, 0.85)",
									color: "rgba(96, 165, 250, 1)",
									borderColor: "rgba(96, 165, 250, 0.3)",
									maxWidth: "400px",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{pos.normalizedUrl}
							</span>
						)}
					</a>
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
