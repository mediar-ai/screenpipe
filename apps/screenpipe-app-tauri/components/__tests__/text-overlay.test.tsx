import { describe, it, expect, vi } from "vitest";
import "../../vitest.setup";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextOverlay, isUrl, normalizeUrl } from "../text-overlay";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

// Mock @tauri-apps/plugin-shell
vi.mock("@tauri-apps/plugin-shell", () => ({
	open: vi.fn().mockResolvedValue(undefined),
}));

describe("TextOverlay", () => {
	const createTextPosition = (
		text: string,
		left: number,
		top: number,
		width: number,
		height: number,
		confidence = 0.9
	): TextPosition => ({
		text,
		confidence,
		bounds: { left, top, width, height },
	});

	it("should render nothing when textPositions is empty", () => {
		const { container } = render(
			<TextOverlay
				textPositions={[]}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(container.firstChild).toBeNull();
	});

	it("should render nothing when no URLs in text positions (only URLs rendered)", () => {
		const positions = [
			createTextPosition("Hello", 0.1, 0.05, 0.08, 0.02),
			createTextPosition("World", 0.2, 0.05, 0.1, 0.02),
		];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		// Only URLs are rendered, so non-URL text produces null
		expect(container.firstChild).toBeNull();
	});

	it("should render URLs as clickable links", () => {
		const positions = [
			createTextPosition("https://example.com", 0.1, 0.05, 0.2, 0.02),
			createTextPosition("Regular text", 0.1, 0.1, 0.15, 0.02),
		];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={true}
			/>
		);

		const link = container.querySelector("a");
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://example.com");
	});

	it("should render nothing when displayed dimensions are invalid", () => {
		const positions = [createTextPosition("https://example.com", 0.1, 0.05, 0.2, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={0}
				displayedHeight={540}
			/>
		);

		expect(container.firstChild).toBeNull();
	});

	it("should filter out positions outside the display bounds", () => {
		const positions = [
			createTextPosition("https://inside.com", 0.1, 0.05, 0.2, 0.02),
			createTextPosition("https://outside.com", 1.5, 0.05, 0.2, 0.02),
		];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={true}
			/>
		);

		const links = container.querySelectorAll("a");
		expect(links.length).toBe(1);
		expect(links[0]).toHaveAttribute("href", "https://inside.com");
	});

	it("should use shell.open on click via Tauri plugin", async () => {
		const { open: mockShellOpen } = await import("@tauri-apps/plugin-shell");

		const positions = [createTextPosition("https://test.com/page", 0.1, 0.05, 0.2, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={true}
			/>
		);

		const link = container.querySelector("a");
		expect(link).toBeInTheDocument();

		fireEvent.click(link!);

		expect(mockShellOpen).toHaveBeenCalledWith("https://test.com/page");
	});

	it("should show visible underline on URL links (not invisible)", () => {
		const positions = [createTextPosition("https://example.com", 0.1, 0.3, 0.2, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={true}
			/>
		);

		const link = container.querySelector("a") as HTMLElement;
		expect(link).toBeInTheDocument();
		// Should have a visible border-bottom (underline)
		expect(link.style.borderBottom).toContain("solid");
		expect(link.style.cursor).toBe("pointer");
	});

	it("should expand small click targets to minimum height", () => {
		// OCR box is only 10px tall at display size (0.02 * 500 = 10px)
		const positions = [createTextPosition("https://tiny.com", 0.1, 0.3, 0.2, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1000}
				originalHeight={1000}
				displayedWidth={500}
				displayedHeight={500}
			/>
		);

		const link = container.querySelector("a") as HTMLElement;
		expect(link).toBeInTheDocument();
		// Height should be expanded to at least 24px (MIN_LINK_HEIGHT)
		const height = parseFloat(link.style.height);
		expect(height).toBeGreaterThanOrEqual(24);
	});

	it("should detect domain-like URLs with various TLDs", () => {
		const positions = [
			createTextPosition("app.crisp.chat", 0.1, 0.1, 0.15, 0.02),
			createTextPosition("screenpi.pe", 0.1, 0.2, 0.1, 0.02),
			createTextPosition("youtube.com", 0.1, 0.3, 0.1, 0.02),
		];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={true}
			/>
		);

		const links = container.querySelectorAll("a");
		expect(links.length).toBe(3);
	});
});

describe("isUrl", () => {
	it("should detect https URLs", () => {
		expect(isUrl("https://example.com")).toBe(true);
		expect(isUrl("https://example.com/path")).toBe(true);
		expect(isUrl("https://sub.example.com/path?query=1")).toBe(true);
	});

	it("should detect http URLs", () => {
		expect(isUrl("http://example.com")).toBe(true);
	});

	it("should detect www URLs", () => {
		expect(isUrl("www.example.com")).toBe(true);
		expect(isUrl("www.example.com/path")).toBe(true);
	});

	it("should detect domain-like strings with common TLDs", () => {
		expect(isUrl("example.com")).toBe(true);
		expect(isUrl("example.io")).toBe(true);
		expect(isUrl("app.example.dev")).toBe(true);
	});

	it("should detect domain-like strings with less common TLDs", () => {
		expect(isUrl("app.crisp.chat")).toBe(true);
		expect(isUrl("screenpi.pe")).toBe(true);
		expect(isUrl("example.cafe")).toBe(true);
		expect(isUrl("my.site.agency")).toBe(true);
	});

	it("should not detect regular text as URLs", () => {
		expect(isUrl("hello")).toBe(false);
		expect(isUrl("hello world")).toBe(false);
		expect(isUrl("email@example")).toBe(false);
		expect(isUrl("just some text")).toBe(false);
	});

	it("should not match text with spaces", () => {
		expect(isUrl("reddit .com")).toBe(false);
		expect(isUrl("hello .world")).toBe(false);
	});

	it("should not match single-char TLDs", () => {
		expect(isUrl("test.a")).toBe(false);
	});
});

describe("normalizeUrl", () => {
	it("should keep https URLs unchanged", () => {
		expect(normalizeUrl("https://example.com")).toBe("https://example.com");
	});

	it("should keep http URLs unchanged", () => {
		expect(normalizeUrl("http://example.com")).toBe("http://example.com");
	});

	it("should add https to www URLs", () => {
		expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
	});

	it("should add https to bare domains", () => {
		expect(normalizeUrl("example.com")).toBe("https://example.com");
	});

	it("should trim whitespace", () => {
		expect(normalizeUrl("  https://example.com  ")).toBe(
			"https://example.com"
		);
	});
});
