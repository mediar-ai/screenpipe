import { describe, it, expect, vi } from "vitest";
import "../../vitest.setup";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextOverlay, isUrl, normalizeUrl } from "../text-overlay";
import type { TextPosition } from "@/lib/hooks/use-frame-ocr-data";

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

	it("should render text positions with correct scaling", () => {
		// Using normalized coordinates (0-1 range)
		const positions = [
			createTextPosition("Hello", 0.1, 0.05, 0.08, 0.02),
			createTextPosition("World", 0.2, 0.05, 0.1, 0.02),
		];

		const { getByText } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(getByText("Hello")).toBeInTheDocument();
		expect(getByText("World")).toBeInTheDocument();
	});

	it("should scale normalized coordinates correctly", () => {
		// Normalized coordinates: left=0.1 (10%), top=0.2 (20%), width=0.08, height=0.04
		const positions = [createTextPosition("Test", 0.1, 0.2, 0.08, 0.04)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1000}
				originalHeight={1000}
				displayedWidth={500}
				displayedHeight={500}
			/>
		);

		const textElement = container.querySelector("span");
		expect(textElement).toHaveStyle({
			left: "50px", // 0.1 * 500
			top: "100px", // 0.2 * 500
			width: "40px", // 0.08 * 500
			height: "20px", // 0.04 * 500
		});
	});

	it("should filter out text below minimum confidence", () => {
		const positions = [
			createTextPosition("HighConf", 0.1, 0.05, 0.08, 0.02, 0.9),
			createTextPosition("LowConf", 0.2, 0.05, 0.08, 0.02, 0.3),
		];

		const { getByText, queryByText } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				minConfidence={0.5}
			/>
		);

		expect(getByText("HighConf")).toBeInTheDocument();
		expect(queryByText("LowConf")).not.toBeInTheDocument();
	});

	it("should render nothing when displayed dimensions are invalid", () => {
		const positions = [createTextPosition("Test", 0.1, 0.05, 0.08, 0.02)];

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

	it("should filter out positions with invalid scaled dimensions", () => {
		const positions = [
			createTextPosition("Valid", 0.1, 0.05, 0.08, 0.02),
			createTextPosition("ZeroWidth", 0.2, 0.05, 0, 0.02),
			createTextPosition("ZeroHeight", 0.3, 0.05, 0.08, 0),
		];

		const { getByText, queryByText } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(getByText("Valid")).toBeInTheDocument();
		expect(queryByText("ZeroWidth")).not.toBeInTheDocument();
		expect(queryByText("ZeroHeight")).not.toBeInTheDocument();
	});

	it("should filter out positions outside the display bounds", () => {
		const positions = [
			createTextPosition("Inside", 0.1, 0.05, 0.08, 0.02),
			createTextPosition("Outside", 1.5, 0.05, 0.08, 0.02), // Beyond normalized 1.0
		];

		const { getByText, queryByText } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(getByText("Inside")).toBeInTheDocument();
		expect(queryByText("Outside")).not.toBeInTheDocument();
	});

	it("should apply debug styles when debug prop is true", () => {
		const positions = [createTextPosition("Debug", 0.1, 0.05, 0.08, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				debug={true}
			/>
		);

		const textElement = container.querySelector("span");
		expect(textElement).toHaveClass("border");
		expect(textElement).toHaveClass("border-red-500/50");
	});

	it("should have transparent text when debug is false", () => {
		const positions = [createTextPosition("Hidden", 0.1, 0.05, 0.08, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				debug={false}
			/>
		);

		const textElement = container.querySelector("span");
		expect(textElement).toHaveClass("text-transparent");
	});

	it("should enable text selection with user-select CSS", () => {
		const positions = [createTextPosition("Selectable", 0.1, 0.05, 0.08, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		const textElement = container.querySelector("span");
		expect(textElement).toHaveStyle({ userSelect: "text" });
	});

	it("should set container dimensions to match displayed image", () => {
		const positions = [createTextPosition("Test", 0.1, 0.05, 0.08, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={800}
				displayedHeight={450}
			/>
		);

		const overlayContainer = container.firstChild as HTMLElement;
		expect(overlayContainer).toHaveStyle({
			width: "800px",
			height: "450px",
		});
	});

	it("should handle many text positions efficiently", () => {
		// Create 1000 text positions to test performance (using normalized coordinates)
		const positions = Array.from({ length: 1000 }, (_, i) =>
			createTextPosition(`Word${i}`, (i % 100) * 0.01, Math.floor(i / 100) * 0.1, 0.05, 0.015)
		);

		const startTime = performance.now();

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={10000}
				originalHeight={2000}
				displayedWidth={1000}
				displayedHeight={200}
			/>
		);

		const endTime = performance.now();
		const renderTime = endTime - startTime;

		// Rendering 1000 elements should take less than 100ms
		expect(renderTime).toBeLessThan(100);

		// Verify some elements rendered
		const spans = container.querySelectorAll("span");
		expect(spans.length).toBeGreaterThan(0);
	});

	it("should render URLs as clickable links when clickableUrls is true", () => {
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
		const span = container.querySelector("span");

		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://example.com");
		expect(span).toBeInTheDocument();
		expect(span?.textContent).toBe("Regular text");
	});

	it("should not render URLs as links when clickableUrls is false", () => {
		const positions = [createTextPosition("https://example.com", 0.1, 0.05, 0.2, 0.02)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				clickableUrls={false}
			/>
		);

		const link = container.querySelector("a");
		const span = container.querySelector("span");

		expect(link).not.toBeInTheDocument();
		expect(span).toBeInTheDocument();
	});

	it("should open URL in new tab when clicked", () => {
		const mockOpen = vi.spyOn(window, "open").mockImplementation(() => null);

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

		expect(mockOpen).toHaveBeenCalledWith(
			"https://test.com/page",
			"_blank",
			"noopener,noreferrer"
		);

		mockOpen.mockRestore();
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

	it("should detect domain-like strings", () => {
		expect(isUrl("example.com")).toBe(true);
		expect(isUrl("example.io")).toBe(true);
		expect(isUrl("app.example.dev")).toBe(true);
	});

	it("should not detect regular text as URLs", () => {
		expect(isUrl("hello")).toBe(false);
		expect(isUrl("hello world")).toBe(false);
		expect(isUrl("email@example")).toBe(false);
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
		expect(normalizeUrl("  https://example.com  ")).toBe("https://example.com");
	});
});
