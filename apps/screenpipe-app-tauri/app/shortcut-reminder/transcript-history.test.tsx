// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptHistory } from "./transcript-history";
import type { MeetingOverlayTranscriptItem } from "./use-meeting-overlay";

const item = (i: number, text = `Turn ${i}`): MeetingOverlayTranscriptItem => ({
  meetingId: 1, itemId: `${i}`, deviceName: "fixture", deviceType: "output",
  speakerName: "Speaker", text, capturedAt: "2026-10-13T10:00:00Z", isFinal: true,
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("overlay transcript following", () => {
  it("holds even a small upward scroll through new and partial speech, then resumes at bottom", () => {
    let height = 600;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    const view = render(<TranscriptHistory items={[item(1)]} scale={1} />);
    const el = screen.getByRole("region", { name: "Live transcript" });
    expect(el.scrollTop).toBe(height);
    el.scrollTop = 478;
    fireEvent.scroll(el);
    height = 650;
    view.rerender(<TranscriptHistory items={[item(1), item(2)]} scale={1} />);
    expect(el.scrollTop).toBe(478);
    expect(screen.queryByText("Turn 2")).toBeNull();
    height = 700;
    view.rerender(<TranscriptHistory items={[item(1), item(2, "More partial speech wrapping onto another line")]} scale={1} />);
    expect(el.scrollTop).toBe(478);
    el.scrollTop = height - 120;
    fireEvent.scroll(el);
    height = 800;
    view.rerender(<TranscriptHistory items={[item(1), item(2), item(3)]} scale={1} />);
    expect(el.scrollTop).toBe(height);
    expect(screen.getByText("Turn 3")).toBeTruthy();
  });

  it("holds the reading snapshot when the bounded live feed drops older entries", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    const view = render(<TranscriptHistory items={[item(1), item(2)]} scale={1} />);
    const el = screen.getByRole("region");
    el.scrollTop = 100;
    fireEvent.scroll(el);
    view.rerender(<TranscriptHistory items={[item(2), item(3)]} scale={1} />);
    expect(el.scrollTop).toBe(100);
    expect(screen.getByText("Turn 1")).toBeTruthy();
    expect(screen.queryByText("Turn 3")).toBeNull();
    el.scrollTop = 480;
    fireEvent.scroll(el);
    expect(screen.queryByText("Turn 1")).toBeNull();
    expect(screen.getByText("Turn 3")).toBeTruthy();
    expect(el.scrollTop).toBe(600);
  });

  it("starts at the latest text after collapsing and reopening", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    const view = render(<TranscriptHistory items={[item(1)]} scale={1} />);
    const el = screen.getByRole("region");
    el.scrollTop = 0;
    fireEvent.scroll(el);
    view.unmount();
    render(<TranscriptHistory items={[item(1), item(2)]} scale={1} />);
    expect(screen.getByRole("region").scrollTop).toBe(600);
  });
});
