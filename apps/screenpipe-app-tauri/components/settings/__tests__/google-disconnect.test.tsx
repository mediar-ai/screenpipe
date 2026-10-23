// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GoogleCalendarCard } from "../google-calendar-card";
import { GoogleDocsCard } from "../google-docs-card";

const mocks = vi.hoisted(() => ({
  accounts: [] as { instance: string | null; display_name: string }[],
  dismissNudge: vi.fn(), disconnect: vi.fn(), toast: vi.fn(), capture: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/utils/tauri", () => ({ commands: {
  oauthListInstances: async () => ({ status: "ok", data: mocks.accounts }),
  oauthStatus: async () => ({ status: "ok", data: { connected: mocks.accounts.length > 0 } }),
  oauthDisconnect: mocks.disconnect,
} }));
vi.mock("@/components/ui/use-toast", () => ({ toast: mocks.toast }));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));
vi.mock("@/lib/connections-events", () => ({ notifyConnectionsUpdated: mocks.notify }));
vi.mock("@/lib/calendar-nudge", () => ({ dismissCalendarNudge: mocks.dismissNudge }));
vi.mock("@/lib/api", () => ({ localFetch: async () => ({ ok: false }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dismissNudge.mockResolvedValue(undefined);
  mocks.accounts = [
    { instance: "first@example.com", display_name: "First account" },
    { instance: "second@example.com", display_name: "Second account" },
  ];
  mocks.disconnect.mockImplementation(async (_id, instance) => {
    mocks.accounts = mocks.accounts.filter(account => account.instance !== instance);
    return { status: "ok", data: true };
  });
});

for (const [id, Card] of [["google-calendar", GoogleCalendarCard], ["google-docs", GoogleDocsCard]] as const) {
  describe(`${id} disconnect`, () => {
    it("removes only the chosen account and refreshes connected state", async () => {
      render(<Card />);
      fireEvent.click(await screen.findByRole("button", { name: "Disconnect First account" }));
      await waitFor(() => expect(screen.queryByText("First account")).toBeNull());
      expect(screen.getByText("Second account")).toBeVisible();
      expect(mocks.disconnect).toHaveBeenCalledWith(id, "first@example.com");
      expect(mocks.notify).toHaveBeenCalledOnce();
      expect(mocks.toast).not.toHaveBeenCalled();
    });

    for (const instance of [null, "only@example.com"]) {
      it(`clears the last account stored under ${instance ?? "the default slot"}`, async () => {
        mocks.accounts = [{ instance, display_name: "Only account" }];
        render(<Card />);
        fireEvent.click(await screen.findByRole("button", { name: "Disconnect Only account" }));
        await waitFor(() => expect(screen.queryByText("Only account")).toBeNull());
        expect(screen.getByText("○ not connected")).toBeVisible();
        expect(mocks.disconnect).toHaveBeenCalledWith(id, instance);
      });
    }

    for (const failure of ["result", "throw", "false"] as const) {
      it(`shows a ${failure} failure, preserves the account, and allows retry`, async () => {
        if (failure === "throw") mocks.disconnect.mockRejectedValueOnce(new Error("database is locked"));
        else if (failure === "result") mocks.disconnect.mockResolvedValueOnce({ status: "error", error: "database is locked" });
        else mocks.disconnect.mockResolvedValueOnce({ status: "ok", data: false });
        render(<Card />);
        const button = await screen.findByRole("button", { name: "Disconnect First account" });
        fireEvent.click(button);
        await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
          variant: "destructive",
          description: failure === "false" ? "Disconnect was not completed. Please try again." : "database is locked",
        })));
        expect(screen.getByText("First account")).toBeVisible();
        expect(mocks.capture).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
        expect(button).not.toBeDisabled();
        fireEvent.click(button);
        await waitFor(() => expect(screen.queryByText("First account")).toBeNull());
        expect(screen.getByText("Second account")).toBeVisible();
      });
    }
  });
}

it("disconnects Calendar even while reminder preferences are waiting on another window", async () => {
  mocks.dismissNudge.mockReturnValue(new Promise(() => {}));
  render(<GoogleCalendarCard />);
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect First account" }));
  await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith("google-calendar", "first@example.com"));
  await waitFor(() => expect(screen.queryByText("First account")).toBeNull());
});
