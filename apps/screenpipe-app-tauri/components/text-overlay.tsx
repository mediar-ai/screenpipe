"use client";

import { useCallback, useMemo, memo, useState } from "react";
import { cn } from "@/lib/utils";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

/**
 * Check if a string looks like a URL.
 * Matches http(s)://, www., and domain-like patterns.
 */
export function isUrl(text: string): boolean {
	const trimmed = text.trim();

	// Reject if contains spaces
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

	// Check for domain-like patterns with any 2-13 char alphabetic TLD
	const domainPattern =
		/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,13}(\/[^\s]*)?$/;

	return domainPattern.test(trimmed);
}

/**
 * Regex to find URLs embedded within arbitrary text.
 * Matches:
 *   - https://... or http://... (up to whitespace)
 *   - www.domain.tld/path
 *   - domain.tld/path (common TLDs only, to avoid false positives in prose)
 */
const URL_IN_TEXT_RE =
	/https?:\/\/[^\s]+|www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,13}[^\s]*|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|io|dev|app|co|ai|edu|gov|me|tv|pe|chat|xyz|live|news|pro|tech|cloud|page|link|site|store|blog)(?:\/[^\s]*)?|[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|co|ai|edu|gov|me|tv|pe|chat|xyz|live|news|pro|tech|cloud|page|link|site|store|blog)(?:\/[^\s]*)?/gi;

/**
 * Extract URLs from a text block and compute their approximate bounding boxes
 * based on character offset within the block.
 */
export interface ExtractedUrl {
	url: string;
	normalizedUrl: string;
	/** Fraction of the text block width where this URL starts (0-1) */
	startFraction: number;
	/** Fraction of the text block width this URL spans (0-1) */
	widthFraction: number;
}

export function extractUrlsFromText(text: string): ExtractedUrl[] {
	const results: ExtractedUrl[] = [];
	const totalLen = text.length;
	if (totalLen === 0) return results;

	let match: RegExpExecArray | null;
	// Reset lastIndex for global regex
	URL_IN_TEXT_RE.lastIndex = 0;

	while ((match = URL_IN_TEXT_RE.exec(text)) !== null) {
		const url = match[0];
		// Clean trailing punctuation that's unlikely part of the URL
		const cleaned = url.replace(/[),;:!?.'"\]]+$/, "");
		if (cleaned.length < 4) continue;

		const startIdx = match.index;
		const startFraction = startIdx / totalLen;
		const widthFraction = cleaned.length / totalLen;

		results.push({
			url: cleaned,
			normalizedUrl: normalizeUrl(cleaned),
			startFraction,
			widthFraction,
		});
	}

	return results;
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

/** A URL link to render, with pixel coordinates */
interface UrlLink {
	key: string;
	normalizedUrl: string;
	displayUrl: string;
	left: number;
	top: number;
	width: number;
	height: number;
}

// Minimum click target height in pixels
const MIN_LINK_HEIGHT = 24;
// Extra horizontal padding on each side
const LINK_PADDING_X = 4;

/**
 * TextOverlay renders clickable URL links positioned over a screenshot.
 * URLs are detected from OCR text (even embedded in longer text blocks)
 * and rendered as visible, hoverable links. Clicking opens the URL in
 * the system default browser via Tauri shell.
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

	// Find all URLs across all text positions and compute their pixel positions
	const urlLinks = useMemo<UrlLink[]>(() => {
		if (!displayedWidth || !displayedHeight) return [];

		const links: UrlLink[] = [];

		for (const pos of textPositions) {
			if (pos.confidence < minConfidence) continue;

			// Scale the block's bounding box to display pixels
			const blockLeft = pos.bounds.left * displayedWidth;
			const blockTop = pos.bounds.top * displayedHeight;
			const blockWidth = pos.bounds.width * displayedWidth;
			const blockHeight = pos.bounds.height * displayedHeight;

			// Skip off-screen or invalid blocks
			if (
				blockWidth <= 0 ||
				blockHeight <= 0 ||
				blockLeft < 0 ||
				blockTop < 0 ||
				blockLeft + blockWidth > displayedWidth + 1 ||
				blockTop + blockHeight > displayedHeight + 1
			) {
				continue;
			}

			// First: check if the entire text is a URL
			if (isUrl(pos.text)) {
				links.push({
					key: `${links.length}-${pos.text.slice(0, 20)}`,
					normalizedUrl: normalizeUrl(pos.text),
					displayUrl: pos.text,
					left: blockLeft,
					top: blockTop,
					width: blockWidth,
					height: blockHeight,
				});
				continue;
			}

			// Second: extract URLs embedded within the text
			const extracted = extractUrlsFromText(pos.text);
			for (const ext of extracted) {
				const urlLeft = blockLeft + ext.startFraction * blockWidth;
				const urlWidth = ext.widthFraction * blockWidth;

				// Skip if the computed URL region is too small or off-screen
				if (urlWidth < 10) continue;
				if (urlLeft + urlWidth > displayedWidth + 1) continue;

				links.push({
					key: `${links.length}-${ext.url.slice(0, 20)}`,
					normalizedUrl: ext.normalizedUrl,
					displayUrl: ext.url,
					left: urlLeft,
					top: blockTop,
					width: urlWidth,
					height: blockHeight,
				});
			}
		}

		return links;
	}, [textPositions, displayedWidth, displayedHeight, minConfidence]);

	const handleUrlClick = useCallback(
		async (url: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				await shellOpen(url);
			} catch (err) {
				console.error("failed to open URL:", url, err);
				window.open(url, "_blank", "noopener,noreferrer");
			}
		},
		[]
	);

	if (!clickableUrls || urlLinks.length === 0) {
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
			{urlLinks.map((link, index) => {
				const isHovered = hoveredIndex === index;

				// Enlarge click target for small OCR boxes
				const rawH = link.height;
				const targetH = Math.max(rawH, MIN_LINK_HEIGHT);
				const extraY = (targetH - rawH) / 2;
				const targetW = link.width + LINK_PADDING_X * 2;

				return (
					<a
						key={link.key}
						href={link.normalizedUrl}
						onClick={(e) =>
							handleUrlClick(link.normalizedUrl, e)
						}
						onMouseEnter={() => setHoveredIndex(index)}
						onMouseLeave={() => setHoveredIndex(null)}
						className="absolute block"
						style={{
							left: link.left - LINK_PADDING_X,
							top: link.top - extraY,
							width: targetW,
							height: targetH,
							cursor: "pointer",
							pointerEvents: "auto",
							borderBottom: isHovered
								? "2px solid rgba(96, 165, 250, 0.9)"
								: "2px solid rgba(96, 165, 250, 0.45)",
							backgroundColor: isHovered
								? "rgba(96, 165, 250, 0.15)"
								: "transparent",
							borderRadius: "2px",
							transition:
								"background-color 0.15s, border-color 0.15s",
							...(debug
								? {
										border: "1px solid rgba(59, 130, 246, 0.7)",
										backgroundColor:
											"rgba(59, 130, 246, 0.2)",
									}
								: {}),
						}}
						title={`Open ${link.normalizedUrl}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						{isHovered && (
							<span
								className="absolute left-0 whitespace-nowrap text-xs px-2 py-1 rounded shadow-lg border z-50"
								style={{
									bottom: targetH + 4,
									backgroundColor:
										"rgba(0, 0, 0, 0.85)",
									color: "rgba(96, 165, 250, 1)",
									borderColor:
										"rgba(96, 165, 250, 0.3)",
									maxWidth: "400px",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{link.normalizedUrl}
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
