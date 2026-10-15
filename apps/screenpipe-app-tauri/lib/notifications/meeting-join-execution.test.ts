// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/api", () => ({ localFetch: mocks.fetch, isLocalApiUrl: () => true }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: mocks.open }));
import { executeNotificationAction } from "./actions";

const action = { type: "meeting_join" as const, url: "https://meet.google.com/example", screen_detail: { boundTo: "prewarm_pending" } };
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
describe("cross-platform combined join", () => {
  it("starts authenticated local capture before opening the call", async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    await executeNotificationAction(action);
    expect(mocks.fetch).toHaveBeenCalledWith("/capture/hd/start", expect.objectContaining({ method: "POST", body: JSON.stringify(action.screen_detail), redirect: "error" }));
    expect(mocks.open).toHaveBeenCalledWith(action.url);
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.open.mock.invocationCallOrder[0]);
  });
  it.each([503, 302])("still joins and reports failed capture for HTTP %s", async (status) => {
    mocks.fetch.mockResolvedValue({ ok: false, status });
    const onScreenDetailError = vi.fn();
    await executeNotificationAction(action, { onScreenDetailError });
    expect(mocks.open).toHaveBeenCalledWith(action.url);
    expect(onScreenDetailError).toHaveBeenCalledTimes(1);
  });
  it("still joins when the capture service is unreachable", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    const onScreenDetailError = vi.fn();
    await executeNotificationAction(action, { onScreenDetailError });
    expect(mocks.open).toHaveBeenCalledWith(action.url);
    expect(onScreenDetailError).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled capture request to three seconds", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const onScreenDetailError = vi.fn();
    const result = executeNotificationAction(action, { onScreenDetailError });
    await vi.advanceTimersByTimeAsync(2999);
    expect(mocks.open).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(mocks.open).toHaveBeenCalledWith(action.url);
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(onScreenDetailError).toHaveBeenCalledTimes(1);
  });
  it("normal joining does not request capture", async () => {
    await executeNotificationAction({ type: "meeting_join", url: action.url });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith(action.url);
  });
});
