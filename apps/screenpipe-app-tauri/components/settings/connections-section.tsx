"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Check, Loader2 } from "lucide-react";
import { open, Command } from "@tauri-apps/plugin-shell";
import { message } from "@tauri-apps/plugin-dialog";
import { writeFile, readTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { platform } from "@tauri-apps/plugin-os";
import { tempDir, join, homeDir } from "@tauri-apps/api/path";
import { ObsidianSyncCard } from "./obsidian-sync-card";
import { AppleIntelligenceCard } from "./apple-intelligence-card";

const GITHUB_RELEASES_API = "https://api.github.com/repos/screenpipe/screenpipe/releases";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

interface McpVersionInfo {
  available: string | null;
  installed: string | null;
}

async function getLatestMcpRelease(): Promise<{ url: string; version: string }> {
  const response = await tauriFetch(GITHUB_RELEASES_API, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch releases");
  }

  const releases: GitHubRelease[] = await response.json();

  // Find the latest mcp release (tag starts with "mcp-v")
  const mcpRelease = releases.find(r => r.tag_name.startsWith("mcp-v"));
  if (!mcpRelease) {
    throw new Error("No MCP release found");
  }

  // Find the .mcpb asset
  const mcpbAsset = mcpRelease.assets.find(a => a.name.endsWith(".mcpb"));
  if (!mcpbAsset) {
    throw new Error("No .mcpb file found in release");
  }

  // Extract version from tag (mcp-v0.5.0 -> 0.5.0)
  const version = mcpRelease.tag_name.replace("mcp-v", "");

  return { url: mcpbAsset.browser_download_url, version };
}

async function getInstalledMcpVersion(): Promise<string | null> {
  try {
    const os = platform();
    const home = await homeDir();

    let configPath: string;
    if (os === "macos") {
      configPath = await join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    } else if (os === "windows") {
      configPath = await join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json");
    } else {
      return null;
    }

    const configContent = await readTextFile(configPath);
    const config = JSON.parse(configContent);

    // Check if screenpipe is configured
    if (config?.mcpServers?.screenpipe) {
      // Try to get version from the installed package
      // For now, just return "installed" if configured
      return "installed";
    }

    return null;
  } catch {
    return null;
  }
}

export function ConnectionsSection() {
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "downloaded">("idle");
  const [versionInfo, setVersionInfo] = useState<McpVersionInfo>({ available: null, installed: null });

  useEffect(() => {
    async function fetchVersions() {
      try {
        const [release, installed] = await Promise.all([
          getLatestMcpRelease().catch(() => null),
          getInstalledMcpVersion(),
        ]);
        setVersionInfo({
          available: release?.version || null,
          installed,
        });
      } catch {
        // Ignore errors
      }
    }
    fetchVersions();
  }, [downloadState]);

  const handleClaudeConnect = async () => {
    try {
      setDownloadState("downloading");

      // Get the latest mcpb URL dynamically
      const release = await getLatestMcpRelease();
      const mcpbUrl = release.url;

      // Use Tauri's HTTP client to avoid CORS issues
      const response = await tauriFetch(mcpbUrl, {
        method: "GET",
      });

      if (!response.ok) throw new Error("Failed to download");

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Save to temp directory automatically (no dialog)
      const tmpDir = await tempDir();
      const filePath = await join(tmpDir, "screenpipe-mcp.mcpb");

      await writeFile(filePath, uint8Array);

      // Open Claude first, then open the .mcpb file to trigger the install modal
      const os = platform();
      if (os === "macos") {
        // Open Claude Desktop first
        const openClaude = Command.create("open", ["-a", "Claude"]);
        await openClaude.execute();

        // Wait for Claude to open
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Then open the .mcpb file - Claude will show the install modal
        const openFile = Command.create("open", [filePath]);
        await openFile.execute();
      } else if (os === "windows") {
        // Open Claude Desktop first
        const openClaude = Command.create("cmd", ["/c", "start", "", "Claude"]);
        await openClaude.execute();

        // Wait for Claude to open
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Then open the .mcpb file
        const openFile = Command.create("cmd", ["/c", "start", "", filePath]);
        await openFile.execute();
      }

      setDownloadState("downloaded");
    } catch (error) {
      console.error("Failed to download mcpb:", error);
      await message("Failed to download extension. Please try again.", {
        title: "Download Error",
        kind: "error",
      });
      setDownloadState("idle");
    }
  };

  const openClaudeDesktop = async () => {
    try {
      const os = platform();

      if (os === "macos") {
        // On macOS, use 'open' command to launch Claude.app
        const cmd = Command.create("open", ["-a", "Claude"]);
        await cmd.execute();
      } else if (os === "windows") {
        // On Windows, try to open Claude from typical install locations
        const cmd = Command.create("cmd", ["/c", "start", "", "Claude"]);
        await cmd.execute();
      } else {
        // Fallback to download page
        await open("https://claude.ai/download");
      }
    } catch {
      // If launching fails, show download page
      await open("https://claude.ai/download");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Connections
        </h1>
        <p className="text-muted-foreground text-sm">
          Connect to AI assistants and other apps
        </p>
      </div>

      <div className="space-y-2">
        <Card className="border-border bg-card overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start p-4 gap-4">
              {/* Claude Logo */}
              <div className="flex-shrink-0">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 512 509.64"
                  xmlns="http://www.w3.org/2000/svg"
                  className="rounded-2xl"
                >
                  <path fill="#D77655" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"/>
                  <path fill="#FCF2EE" fillRule="nonzero" d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"/>
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Claude Desktop
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                    by Anthropic
                  </span>
                  {versionInfo.available && (
                    <span className="px-2 py-0.5 text-xs font-mono bg-muted text-muted-foreground rounded">
                      v{versionInfo.available}
                    </span>
                  )}
                  {versionInfo.installed && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-foreground text-background rounded-full">
                      installed
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Search your screen recordings and audio with natural language.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleClaudeConnect}
                    disabled={downloadState === "downloading"}
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                  >
                    {downloadState === "downloading" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : downloadState === "downloaded" ? (
                      <>
                        <Check className="h-4 w-4" />
                        Installed
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Install Extension
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={openClaudeDesktop}
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Claude
                  </Button>
                </div>
              </div>
            </div>

            {/* Success message */}
            {downloadState === "downloaded" && (
              <div className="px-4 pb-4">
                <div className="p-3 bg-muted border border-border rounded-lg">
                  <p className="text-xs text-foreground">
                    <strong>Screenpipe is now connected to Claude!</strong> Try asking Claude:
                    &quot;What did I do in the last 5 minutes?&quot; or &quot;Search my screen for meetings today&quot;
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Apple Intelligence */}
        <AppleIntelligenceCard />

        {/* Obsidian Sync */}
        <ObsidianSyncCard />

        {/* Learn & Build section */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Learn & Build
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <button
              onClick={() => open("https://docs.screenpi.pe/api-reference")}
              className="flex items-center gap-2 p-3 bg-card hover:bg-muted border border-border rounded-lg transition-colors text-left group"
            >
              <span className="text-lg">📡</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">REST API</p>
                <p className="text-xs text-muted-foreground truncate">Query data via HTTP</p>
              </div>
            </button>

            <button
              onClick={() => open("https://docs.screenpi.pe/mcp-server")}
              className="flex items-center gap-2 p-3 bg-card hover:bg-muted border border-border rounded-lg transition-colors text-left group"
            >
              <span className="text-lg">🔌</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">MCP Server</p>
                <p className="text-xs text-muted-foreground truncate">Cursor, Claude</p>
              </div>
            </button>

            <button
              onClick={() => open("https://docs.screenpi.pe/mcp-apps")}
              className="flex items-center gap-2 p-3 bg-card hover:bg-muted border border-border rounded-lg transition-colors text-left group"
            >
              <span className="text-lg">🤖</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">AI Agents</p>
                <p className="text-xs text-muted-foreground truncate">Automate workflows</p>
              </div>
            </button>

            <button
              onClick={() => open("https://docs.screenpi.pe/sdk-reference")}
              className="flex items-center gap-2 p-3 bg-card hover:bg-muted border border-border rounded-lg transition-colors text-left group"
            >
              <span className="text-lg">🔧</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">SDK</p>
                <p className="text-xs text-muted-foreground truncate">TypeScript</p>
              </div>
            </button>

            <button
              onClick={() => open("https://docs.screenpi.pe")}
              className="flex items-center gap-2 p-3 bg-card hover:bg-muted border border-border rounded-lg transition-colors text-left group"
            >
              <span className="text-lg">📚</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">All Docs</p>
                <p className="text-xs text-muted-foreground truncate">Full documentation</p>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
