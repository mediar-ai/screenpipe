import { join } from "path";
import { mkdir, writeFile, chmod } from "fs/promises";
import { platform } from "os";
import { fetch } from "undici"; // lightweight fetch for node
import fs from "fs/promises";

const FFMPEG_VERSIONS = {
  darwin: {
    arm64:
      "https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0/ffmpeg-darwin-arm64",
    x64: "https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0/ffmpeg-darwin-x64",
  },
  win32: {
    x64: "https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0/ffmpeg-win32-x64.exe",
  },
  linux: {
    x64: "https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0/ffmpeg-linux-x64",
  },
};

async function downloadFfmpeg() {
  const os = platform();
  const arch = process.arch;

  if (!FFMPEG_VERSIONS[os]?.[arch]) {
    throw new Error(`unsupported platform: ${os}-${arch}`);
  }

  const url = FFMPEG_VERSIONS[os][arch];
  const binPath = join(process.cwd(), "src-tauri", "binaries");
  const ffmpegPath = join(binPath, os === "win32" ? "ffmpeg.exe" : "ffmpeg");

  console.log("debug info:");
  console.log("- platform:", os);
  console.log("- architecture:", arch);
  console.log("- downloading from:", url);
  console.log("- saving to:", ffmpegPath);

  await mkdir(binPath, { recursive: true });

  console.log("downloading ffmpeg...");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`downloaded ${buffer.length} bytes`);

  await writeFile(ffmpegPath, buffer);
  console.log("saved file successfully");

  if (os !== "win32") {
    await chmod(ffmpegPath, "755");
    console.log("made binary executable");
  }

  // Verify the file exists and is executable
  try {
    const stats = await fs.stat(ffmpegPath);
    console.log("file stats:", {
      size: stats.size,
      mode: stats.mode.toString(8),
      executable: !!(stats.mode & 0o111),
    });
  } catch (err) {
    console.error("failed to verify file:", err);
  }
}

downloadFfmpeg().catch(console.error);
