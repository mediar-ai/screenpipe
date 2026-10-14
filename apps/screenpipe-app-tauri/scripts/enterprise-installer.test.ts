// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeConfig } from "./native-build-queue";

const tauriRoot = join(import.meta.dir, "..", "src-tauri");
const enterprise = JSON.parse(readFileSync(
  join(tauriRoot, "tauri.enterprise.conf.json"),
  "utf8",
));
const persistence = JSON.parse(readFileSync(
  join(tauriRoot, "tauri.enterprise-persistent.conf.json"),
  "utf8",
));
const template = readFileSync(
  join(tauriRoot, "windows", "enterprise-installer.nsi"),
  "utf8",
);

describe("ordinary Enterprise installer scope", () => {
  test("uses mixed scope without requesting elevation at entry", () => {
    expect(enterprise.bundle.windows.nsis).toMatchObject({
      installMode: "both",
      template: "windows/enterprise-installer.nsi",
    });
    expect(template).toContain("RequestExecutionLevel user");
    expect(template).not.toContain("MULTIUSER_EXECUTIONLEVEL Highest");
  });

  test("defaults fresh installs to current-user and discloses machine scope", () => {
    expect(template).toContain('Call SetCurrentUserScope');
    expect(template).toContain('StrCpy $INSTDIR "$LOCALAPPDATA\\${PRODUCTNAME}"');
    expect(template).toContain("Change install location  ›");
    expect(template).toContain("For all users of this machine");
    expect(template).toContain("Administrator approval required");
  });

  test("detects scope and directory independently and rejects ambiguity", () => {
    expect(template).toContain('ReadRegStr $2 HKCU "${UNINSTKEY}" "UninstallString"');
    expect(template).toContain('ReadRegStr $3 HKLM "${UNINSTKEY}" "UninstallString"');
    expect(template).toContain('${FileExists} "$0\\uninstall.exe"');
    expect(template).toContain('StrCpy $ExistingInstallDir $1');
    expect(template).toContain('StrCpy $INSTDIR $ExistingInstallDir');
    expect(template).toContain('$INSTDIR != $ExistingInstallDir');
    expect(template).toContain("registered for both the current user and all users");
    expect(template).toContain("does not point to a valid installation");
  });

  test("elevates only the selected or detected machine scope", () => {
    expect(template).toContain('${If} $InstallScope == "all"');
    expect(template).toContain("Call ElevateMachineInstall");
    expect(template).toContain("/SPALLUSERS /P");
    expect(template).toContain("SetErrorLevel 1223");
  });
});

test("persistence package stays machine-only when configs are merged", () => {
  const merged = mergeConfig(enterprise, persistence) as typeof enterprise;
  expect(merged.bundle.windows.nsis.installMode).toBe("perMachine");
  expect(merged.bundle.windows.nsis.installerHooks).toBe(
    "windows/persistent-hooks.nsh",
  );
});
