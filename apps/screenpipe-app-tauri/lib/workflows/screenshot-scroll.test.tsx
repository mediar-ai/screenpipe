// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSourceScreenshot } from "../../../../packages/workflows-ui/src/use-source-screenshot";
import { SopScreenshot } from "../../../../packages/workflows-ui/src/sop-screenshot";

const capture = { frameId: 42, timestamp: "2026-10-21T15:00:00Z", app: "Browser", dataUrl: "blob:original", visualVerified: true, matchDistanceSeconds: 0 };
let intersect: (visible: boolean) => void;
const disconnect = vi.fn();
const revoke = vi.fn();
beforeEach(() => {
  disconnect.mockClear(); revoke.mockClear();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { intersect = visible => callback([{ isIntersecting: visible }]); }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal("URL", { revokeObjectURL: revoke });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Source({ load, frameId = 42 }: { load: ReturnType<typeof vi.fn>; frameId?: number }) {
  const source = useSourceScreenshot({ evidence: [] }, false, load, { ...capture, frameId });
  return <figure ref={source.ref}>{source.image && <img alt="Source" src={source.image.dataUrl} />}</figure>;
}

it("loads lazily, keeps the same source image while scrolling away and back, and releases it on unmount", async () => {
  const load = vi.fn(async () => capture);
  const view = render(<Source load={load} />);
  expect(load).not.toHaveBeenCalled();
  act(() => intersect(true));
  await screen.findByRole("img", { name: "Source" });
  const image = screen.getByRole("img");
  act(() => intersect(false));
  expect(screen.getByRole("img")).toBe(image);
  expect(revoke).not.toHaveBeenCalled();
  act(() => intersect(true));
  expect(load).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:original");
});

it("still releases and replaces the screenshot when its source changes", async () => {
  const load = vi.fn(async (_timestamp: string, _app: string, _signal: AbortSignal, frameId?: number) => ({ ...capture, frameId, dataUrl: `blob:${frameId}` }));
  const view = render(<Source load={load} />);
  act(() => intersect(true));
  await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:42"));
  view.rerender(<Source load={load} frameId={43} />);
  await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:43"));
  expect(revoke).toHaveBeenCalledWith("blob:42");
});

it("keeps a legacy SOP original instead of swapping back to its differently sized saved preview on scroll", async () => {
  const load = vi.fn(async () => "blob:original");
  const view = render(<SopScreenshot src="data:image/png;base64,preview" frameId={42} load={load} alt="SOP" />);
  expect(load).not.toHaveBeenCalled();
  act(() => intersect(true));
  await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:original"));
  act(() => intersect(false));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:original");
  act(() => intersect(true));
  expect(load).toHaveBeenCalledTimes(1);
  expect(revoke).not.toHaveBeenCalled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:original");
});
