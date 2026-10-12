// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageMigrationStatus } from "@/lib/utils/tauri";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), localFetch: vi.fn(), getStorageMigrationStatus: vi.fn(),
  compactStorage: vi.fn(), getLowDiskGuardConfig: vi.fn(async () => ({ thresholdBytes: 0 })),
}));
vi.mock("@/lib/hooks/use-settings", () => ({ useSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
vi.mock("@/lib/hooks/use-interval", () => ({ useInterval: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/api", () => ({ localFetch: mocks.localFetch }));
vi.mock("@/lib/utils/tauri", () => ({ commands: mocks }));
vi.mock("../setting-previews", () => ({ RetentionModePreview: () => null }));

import { RetentionSettings } from "../retention-settings";

let storage: StorageMigrationStatus;
const refresh = vi.fn();
const mount = (availableBytes = 3 * 1024 ** 3) => render(
  <RetentionSettings availableBytes={availableBytes} databaseBytes={139 * 1024 ** 3} onStorageChanged={refresh} />,
);
async function confirm() {
  const button = screen.getByRole("button", { name: "Compact database" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: "Compact now" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  storage = {
    root: "/fixture", app_session_id: "test", generation: "generation-1", busy: false,
    message: "", error: null, pending: false, in_place: true, completed: true,
    using_new_storage: true, source_bytes: 0, migrated_bytes: 1000, bytes_saved: null,
    available_bytes: null, can_migrate: false, can_cancel: false, can_delete_source: false,
    blocked_reason: null,
  };
  mocks.getStorageMigrationStatus.mockImplementation(async () => ({ status: "ok", data: { ...storage } }));
  mocks.compactStorage.mockResolvedValue({ status: "ok", data: null });
  mocks.localFetch.mockImplementation(async (url: string) => new Response(JSON.stringify(
    url === "/data/compact" ? { bytes_reclaimed: 1024 } : { enabled: false, total_deleted: 0 },
  )));
});
afterEach(cleanup);

describe("database compaction", () => {
  it("confirms offline compressed compaction without the legacy apparent-size disk gate", async () => {
    mount();
    const button = screen.getByRole("button", { name: "Compact database" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText(/Needs about/)).toBeNull();
    fireEvent.click(button);
    expect(mocks.compactStorage).not.toHaveBeenCalled();
    expect(screen.getByText(/Recording and history access pause/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compact now" }));
    await waitFor(() => expect(mocks.compactStorage).toHaveBeenCalledWith("/fixture", "generation-1"));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(mocks.localFetch).not.toHaveBeenCalledWith("/data/compact", expect.anything());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Database compacted" }));
  });

  it("does not report success or admit duplicate work until native reopen completes", async () => {
    let finish!: (value: unknown) => void;
    mocks.compactStorage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount();
    await confirm();
    await waitFor(() => expect(mocks.compactStorage).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Compact database" })).toBeDisabled();
    expect(mocks.toast).not.toHaveBeenCalled();
    finish({ status: "ok", data: null });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("shows the actual native failure and permits an explicit retry", async () => {
    mocks.compactStorage.mockResolvedValueOnce({ status: "error", error: "Not enough free space; source retained. Free space and retry." });
    mount();
    await confirm();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to compact database", description: "Not enough free space; source retained. Free space and retry.",
    })));
    expect(refresh).not.toHaveBeenCalled();
    await confirm();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it.each(["root", "generation"] as const)("rejects a changed %s after confirmation opens", async (field) => {
    mount();
    const button = screen.getByRole("button", { name: "Compact database" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    storage[field] = "changed";
    fireEvent.click(screen.getByRole("button", { name: "Compact now" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Storage changed") })));
    expect(mocks.compactStorage).not.toHaveBeenCalled();
    expect(mocks.localFetch).not.toHaveBeenCalledWith("/data/compact", expect.anything());
  });

  it("keeps the existing SQLite VACUUM and disk preflight", async () => {
    storage.generation = null;
    const app = mount();
    await waitFor(() => expect(screen.getByText(/Needs about/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Compact database" })).toBeDisabled();
    app.rerender(<RetentionSettings availableBytes={300 * 1024 ** 3} databaseBytes={139 * 1024 ** 3} />);
    await confirm();
    await waitFor(() => expect(mocks.localFetch).toHaveBeenCalledWith("/data/compact", { method: "POST" }));
    expect(mocks.compactStorage).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Reclaimed 1.0 KB of disk space." })));
  });

  it("does not guess a storage mode when the native status is unavailable", async () => {
    mocks.getStorageMigrationStatus.mockRejectedValue(new Error("Storage unavailable"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage unavailable");
    expect(screen.getByRole("button", { name: "Compact database" })).toBeDisabled();
    expect(mocks.compactStorage).not.toHaveBeenCalled();
  });
});
