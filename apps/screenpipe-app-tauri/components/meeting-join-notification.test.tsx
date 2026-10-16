// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingJoinNotification } from "./meeting-join-notification";
import { meetingJoinChoices, meetingProvider } from "@/lib/notifications/meeting-join";
import type { NotificationAction } from "@/lib/notifications/actions";

const actions: NotificationAction[] = [
  { id: "join", type: "meeting_join", label: "join and take notes", url: "https://meet.google.com/example", deeplinkUrl: "screenpipe://meeting/42", primary: true },
  { id: "hd", type: "api", url: "/capture/hd/start", method: "POST", body: { boundTo: "prewarm_pending" }, label: "+ HD" },
];
const props = { title: "meeting starting in 1 min", body: "Weekly team sync", actions, onDismiss: vi.fn() };

describe("shared desktop join card", () => {
  it("joins normally in one click without starting HD", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<MeetingJoinNotification {...props} onAction={onAction} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "join and take notes" })));
    expect(onAction).toHaveBeenCalledWith(actions[0]);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("joins and records HD in one click, preserving the meeting and note URLs", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<MeetingJoinNotification {...props} onAction={onAction} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join and take notes with HD screen recording" })));
    expect(onAction).toHaveBeenCalledWith({ ...actions[0], id: "hd", screen_detail: actions[1].body });
  });
  it("prevents a second join while the first request is pending", async () => {
    let finish!: () => void;
    const onAction = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<MeetingJoinNotification {...props} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Join and take notes with HD screen recording" }));
    fireEvent.click(screen.getByRole("button", { name: "join and take notes" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
  it("only offers HD when the notification includes an eligible capture action", () => {
    render(<MeetingJoinNotification {...props} actions={[actions[0]]} onAction={vi.fn()} />);
    expect(screen.queryByText("join + HD")).toBeNull();
    expect(meetingJoinChoices([actions[0], { ...actions[1], url: "/unrelated" }])?.hd).toBeNull();
  });
  it.each([
    ["https://meet.google.com/example", "googleMeet"], ["https://us02web.zoom.us/j/1", "zoom"],
    ["https://teams.microsoft.com/l/meetup-join/1", "teams"], ["https://example.webex.com/meet/test", "webex"],
    ["https://zoom.us.evil.example/", null], ["https://evil.example/?next=https://meet.google.com", null],
    ["not-a-url", null],
  ])("matches provider only from the destination hostname: %s", (url, expected) => {
    expect(meetingProvider(url)).toBe(expected);
  });
});
