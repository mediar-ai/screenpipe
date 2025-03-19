import { join } from "path";
import { mkdir, writeFile, chmod } from "fs/promises";
import { platform } from "os";
import { fetch } from "undici"; // lightweight fetch for node

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

  await mkdir(binPath, { recursive: true });

  const ffmpegPath = join(binPath, os === "win32" ? "ffmpeg.exe" : "ffmpeg");

  console.log(`downloading ffmpeg for ${os}-${arch}...`);
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(ffmpegPath, buffer);

  // Make binary executable on Unix systems
  if (os !== "win32") {
    await chmod(ffmpegPath, "755");
  }
}

downloadFfmpeg().catch(console.error);
