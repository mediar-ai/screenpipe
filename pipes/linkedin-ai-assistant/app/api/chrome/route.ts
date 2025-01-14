import { NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { quitBrowser } from "@/lib/browser-setup";
import os from "os";
import { pipe } from "@screenpipe/js";
export const runtime = "nodejs"; // specify node runtime

const execPromise = promisify(exec);

// helper to get chrome path based on platform
function getChromePath() {
  switch (os.platform()) {
    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    case "linux":
      return "/usr/bin/google-chrome";
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    default:
      throw new Error("unsupported platform");
  }
}

export async function POST() {
  try {
    pipe.captureMainFeatureEvent("linkedin-ai-assistant", {
      action: "launch-chrome",
    });
    console.log("attempting to launch chrome in", process.env.NODE_ENV);

    await quitChrome();
    await quitBrowser();

    const chromePath = getChromePath();
    console.log("using chrome path:", chromePath);

    const chromeProcess = spawn(
      chromePath,
      [
        "--remote-debugging-port=9222",
        "--restore-last-session",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // Add these flags to help with stability
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      {
        detached: true,
        stdio: "ignore",
      }
    );

    chromeProcess.unref();

    // increase timeout and add retries
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const response = await fetch("http://127.0.0.1:9222/json/version");
        if (response.ok) {
          console.log("chrome debug port responding");
          return NextResponse.json({ success: true });
        }
      } catch (err) {
        console.log(`attempt ${attempts + 1} failed:`, err);
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error(
            "failed to connect to chrome debug port after multiple attempts"
          );
        }
      }
    }
  } catch (err) {
    console.error("failed to launch chrome:", err);
    return NextResponse.json(
      {
        success: false,
        error: String(err),
        details: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await quitChrome();
    await quitBrowser();
    console.log("chrome process terminated");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("failed to kill chrome:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

async function quitChrome() {
  const platform = os.platform();
  const killCommand =
    platform === "win32"
      ? `taskkill /F /IM chrome.exe`
      : `pkill -f -- "Google Chrome"`;

  try {
    await execPromise(killCommand);
    console.log("chrome killed");
  } catch (error) {
    console.log("no chrome process found to kill", error);
  }
}
