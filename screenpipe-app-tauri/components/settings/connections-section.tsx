"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Check, Loader2, Copy, Terminal } from "lucide-react";
import { open, Command } from "@tauri-apps/plugin-shell";
import { message } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { platform } from "@tauri-apps/plugin-os";
import { tempDir, join } from "@tauri-apps/api/path";
import { useSettings } from "@/lib/hooks/use-settings";

const GITHUB_RELEASES_API = "https://api.github.com/repos/mediar-ai/screenpipe/releases";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

async function getLatestMcpbUrl(): Promise<string> {
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

  return mcpbAsset.browser_download_url;
}

export function ConnectionsSection() {
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "downloaded">("idle");
  const [copiedEnv, setCopiedEnv] = useState(false);
  const { settings } = useSettings();
  const user = settings.user;

  const agentSdkEnvVars = `export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_BASE_URL=https://ai-proxy.i-f9f.workers.dev
export CLAUDE_CODE_SKIP_VERTEX_AUTH=1
export ANTHROPIC_API_KEY=${user?.token || "your-user-token"}`;

  const copyEnvVars = async () => {
    try {
      await navigator.clipboard.writeText(agentSdkEnvVars);
      setCopiedEnv(true);
      setTimeout(() => setCopiedEnv(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleClaudeConnect = async () => {
    try {
      setDownloadState("downloading");

      // Get the latest mcpb URL dynamically
      const mcpbUrl = await getLatestMcpbUrl();

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
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Connections
        </h1>
        <p className="text-muted-foreground text-lg">
          Connect Screenpipe to AI assistants and other applications
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start p-6 gap-6">
              {/* Claude Logo */}
              <div className="flex-shrink-0">
                <svg
                  width="64"
                  height="64"
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
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    Claude Desktop
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    by Anthropic
                  </span>
                </div>
                <p className="text-muted-foreground mb-4">
                  Connect Screenpipe to Claude Desktop to search your screen recordings,
                  audio transcriptions, and control your computer using natural language.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleClaudeConnect}
                    disabled={downloadState === "downloading"}
                    className="gap-2"
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
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Claude
                  </Button>
                </div>
              </div>
            </div>

            {/* Success message */}
            {downloadState === "downloaded" && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <strong>Screenpipe is now connected to Claude!</strong> Try asking Claude:
                    &quot;What did I do in the last 5 minutes?&quot; or &quot;Search my screen for meetings today&quot;
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary">
            <strong>How it works:</strong> The extension allows Claude to search through your
            Screenpipe recordings and transcriptions. Make sure Screenpipe is running when you
            use Claude with Screenpipe features.
          </p>
        </div>

        {/* Claude Agent SDK Card */}
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start p-6 gap-6">
              {/* Terminal Icon */}
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center">
                  <Terminal className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    Claude Agent SDK
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full">
                    Developer
                  </span>
                </div>
                <p className="text-muted-foreground mb-4">
                  Use the Claude Agent SDK to build AI agents that can interact with your
                  screen recordings programmatically. Powered by Screenpipe&apos;s Vertex AI credits.
                </p>

                {!user?.token ? (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      <strong>Sign in required:</strong> Please sign in to use the Agent SDK with Screenpipe Cloud.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-muted/50 rounded-lg p-4 mb-4 font-mono text-sm overflow-x-auto">
                      <pre className="whitespace-pre-wrap break-all">{agentSdkEnvVars}</pre>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={copyEnvVars}
                        variant={copiedEnv ? "default" : "outline"}
                        className="gap-2"
                      >
                        {copiedEnv ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy Environment Variables
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => open("https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk")}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        SDK Docs
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="px-6 pb-6">
              <div className="p-4 bg-muted/30 border border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Quick Start:</strong>
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Install Claude Code: <code className="bg-muted px-1 rounded">curl -fsSL https://claude.ai/install.sh | bash</code></li>
                  <li>Copy the environment variables above</li>
                  <li>Paste them in your terminal before running your agent</li>
                  <li>Use the SDK with Screenpipe MCP for full access to your recordings</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
