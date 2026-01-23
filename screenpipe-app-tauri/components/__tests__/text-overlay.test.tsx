import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextOverlay } from "../text-overlay";
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
		const positions = [
			createTextPosition("Hello", 100, 50, 80, 20),
			createTextPosition("World", 200, 50, 100, 20),
		];

		render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(screen.getByText("Hello")).toBeInTheDocument();
		expect(screen.getByText("World")).toBeInTheDocument();
	});

	it("should scale coordinates correctly (50% scale)", () => {
		const positions = [createTextPosition("Test", 100, 200, 80, 40)];

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
			left: "50px", // 100 * 0.5
			top: "100px", // 200 * 0.5
			width: "40px", // 80 * 0.5
			height: "20px", // 40 * 0.5
		});
	});

	it("should filter out text below minimum confidence", () => {
		const positions = [
			createTextPosition("HighConf", 100, 50, 80, 20, 0.9),
			createTextPosition("LowConf", 200, 50, 80, 20, 0.3),
		];

		render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
				minConfidence={0.5}
			/>
		);

		expect(screen.getByText("HighConf")).toBeInTheDocument();
		expect(screen.queryByText("LowConf")).not.toBeInTheDocument();
	});

	it("should render nothing when dimensions are invalid", () => {
		const positions = [createTextPosition("Test", 100, 50, 80, 20)];

		const { container } = render(
			<TextOverlay
				textPositions={positions}
				originalWidth={0}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(container.firstChild).toBeNull();
	});

	it("should filter out positions with invalid scaled dimensions", () => {
		const positions = [
			createTextPosition("Valid", 100, 50, 80, 20),
			createTextPosition("ZeroWidth", 200, 50, 0, 20),
			createTextPosition("ZeroHeight", 300, 50, 80, 0),
		];

		render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(screen.getByText("Valid")).toBeInTheDocument();
		expect(screen.queryByText("ZeroWidth")).not.toBeInTheDocument();
		expect(screen.queryByText("ZeroHeight")).not.toBeInTheDocument();
	});

	it("should filter out positions outside the display bounds", () => {
		const positions = [
			createTextPosition("Inside", 100, 50, 80, 20),
			createTextPosition("Outside", 2000, 50, 80, 20), // Beyond 1920px original width
		];

		render(
			<TextOverlay
				textPositions={positions}
				originalWidth={1920}
				originalHeight={1080}
				displayedWidth={960}
				displayedHeight={540}
			/>
		);

		expect(screen.getByText("Inside")).toBeInTheDocument();
		expect(screen.queryByText("Outside")).not.toBeInTheDocument();
	});

	it("should apply debug styles when debug prop is true", () => {
		const positions = [createTextPosition("Debug", 100, 50, 80, 20)];

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
		const positions = [createTextPosition("Hidden", 100, 50, 80, 20)];

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
		const positions = [createTextPosition("Selectable", 100, 50, 80, 20)];

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
		const positions = [createTextPosition("Test", 100, 50, 80, 20)];

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
		// Create 1000 text positions to test performance
		const positions = Array.from({ length: 1000 }, (_, i) =>
			createTextPosition(`Word${i}`, i * 10, Math.floor(i / 100) * 20, 50, 15)
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
});
