// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeConfig, parseEnterpriseBundleArgs } from "./native-build-queue";

const tauriRoot = join(import.meta.dir, "..", "src-tauri");
const enterprise = JSON.parse(readFileSync(join(tauriRoot, "tauri.enterprise.conf.json"), "utf8"));
const persistence = JSON.parse(readFileSync(join(tauriRoot, "tauri.enterprise-persistent.conf.json"), "utf8"));

test("persistence package clears the ordinary custom template and stays machine-only", () => {
  const merged = mergeConfig(enterprise, persistence) as typeof enterprise;
  expect(merged.bundle.windows.nsis.installMode).toBe("perMachine");
  expect(merged.bundle.windows.nsis.template).toBeNull();
  expect(merged.bundle.windows.nsis.installerHooks).toBe("windows/persistent-hooks.nsh");
});

test("enterprise bundle keeps QA build bypasses explicit", () => {
  expect(parseEnterpriseBundleArgs(["--build", "--updater-artifacts", "--ignore-version-mismatches", "--config", "qa.json"])).toEqual({
    build: true,
    updaterArtifacts: true,
    upstreamTemplate: false,
    ignoreVersionMismatches: true,
    bundleArgs: ["--config", "qa.json"],
  });
});
