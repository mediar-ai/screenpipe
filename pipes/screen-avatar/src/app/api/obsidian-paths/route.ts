import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

async function fileExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readObsidianConfig(configPath: string) {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function GET() {
  const home = os.homedir();
  const platform = os.platform();

  // Define potential config locations based on OS
  const configPaths =
    {
      darwin: path.join(
        home,
        "Library/Application Support/obsidian/obsidian.json"
      ),
      win32: path.join(home, "AppData/Roaming/obsidian/obsidian.json"),
      linux: path.join(home, ".config/obsidian/obsidian.json"),
    }[platform as "darwin" | "win32" | "linux"] || null;

  // Common paths to check
  const commonPaths = [
    path.join(home, "Documents/Obsidian"),
    path.join(home, "Obsidian"),
    path.join(home, "Documents/Knowledge Base"),
  ];

  if (platform === "darwin") {
    commonPaths.push(
      path.join(home, "Library/Mobile Documents/iCloud~md~obsidian/Documents")
    );
  }

  // Read actual vault paths from obsidian.json if it exists
  let vaultPaths: string[] = [];
  if (configPaths) {
    const config = await readObsidianConfig(configPaths);
    if (config?.vaults) {
      vaultPaths = Object.values(config.vaults).map((vault: any) => vault.path);
    }
  }

  // Check which common paths actually exist
  const existingPaths = await Promise.all(
    [...new Set([...vaultPaths, ...commonPaths])].map(async (p) => {
      const exists = await fileExists(p);
      return exists ? p : null;
    })
  );

  return NextResponse.json({
    paths: existingPaths.filter(Boolean),
    configFound: Boolean(configPaths && (await fileExists(configPaths))),
  });
}
