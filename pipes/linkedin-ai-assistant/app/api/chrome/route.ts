import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { quitBrowser } from '@/lib/browser-setup';
import os from 'os';
import { ChromeSession } from '@/lib/chrome-session';
import { RouteLogger } from '@/lib/route-logger';
// import { pipe } from "@screenpipe/js";

const logger = new RouteLogger('chrome-route');

export const runtime = 'nodejs'; // specify node runtime

const execPromise = promisify(exec);

// helper to get chrome path based on platform
function getChromePath() {
  switch (os.platform()) {
    case "darwin": {
      const isArm = os.arch() === 'arm64';
      logger.log(`mac architecture: ${os.arch()}`);
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    case "linux":
      return "/usr/bin/google-chrome";
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    default:
      throw new Error("unsupported platform");
  }
}

interface ScreenDimensions {
    width: number;
    height: number;
}

function getScreenDimensions(requestDims?: ScreenDimensions) {
    const defaultDims = { width: 2560, height: 1440 };
    
    if (requestDims) {
        logger.log(`using client screen dimensions: ${requestDims.width}x${requestDims.height}`);
        return requestDims;
    }
    
    logger.log(`no dimensions provided, using defaults: ${defaultDims.width}x${defaultDims.height}`);
    return defaultDims;
}

export async function POST(request: Request) {
  try {
    logger.log('starting POST request');

    // Get dimensions from request first
    const body = await request.json();
    const screenDims = getScreenDimensions(body.screenDims);
    const additionalFlags = [
      '--remote-debugging-port=9222',
      '--restore-last-session',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-position=${screenDims.width / 2},0`,
      `--window-size=${screenDims.width / 2},${screenDims.height}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-networking',
      '--disable-features=TranslateUI',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
    ].flat();
    // Log environment info
    logger.log(`environment: ${process.env.NODE_ENV}`);
    logger.log(`current platform: ${os.platform()}`);
    logger.log(`system architecture: ${os.arch()}`);
    logger.log(`cpu info: ${JSON.stringify(os.cpus()[0], null, 2)}`);

    logger.log("checking for existing chrome instance...");
    let wsUrl: string | null = null;
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (response.ok) {
        const data = await response.json() as { webSocketDebuggerUrl: string };
        wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
        logger.log(`found existing chrome instance at ${wsUrl}`);
      } else {
        logger.log('no existing chrome instance found, launching a new one');
      }
    } catch (error) {
      logger.error(`error checking for existing chrome instance: ${error}`);
      logger.log('launching a new chrome instance');
    }

    if (!wsUrl) {
      logger.log("attempting to launch chrome");
      logger.log("killing existing chrome instances...");
      await quitChrome(); // only kill if we are about to launch a new one
      await quitBrowser(logger);

      const chromePath = getChromePath();
      logger.log(`using chrome path: ${chromePath}`);
      logger.log(`checking if chrome exists: ${require('fs').existsSync(chromePath)}`);

      logger.log("spawning chrome with debugging port 9222...");
      const isArmMac = os.platform() === 'darwin' && os.arch() === 'arm64';
      const spawnCommand = isArmMac ? 'arch' : chromePath;
      const spawnArgs = isArmMac ? [
        '-arm64',
        chromePath,
        ...additionalFlags
      ] : [
        ...additionalFlags
      ];

      const chromeProcess = spawn(spawnCommand, spawnArgs, {
        detached: true,
        stdio: 'ignore'
      });

      chromeProcess.unref();
      logger.log("chrome process spawned and detached");

      logger.log("waiting for chrome to initialize...");
      await new Promise(resolve => setTimeout(resolve, 3000));

      let attempts = 0;
      const maxAttempts = 5;
      logger.log(`attempting to connect to debug port (max ${maxAttempts} attempts)`);

      while (attempts < maxAttempts) {
        try {
          logger.log(`connection attempt ${attempts + 1}/${maxAttempts}`);
          const response = await fetch('http://127.0.0.1:9222/json/version');
          const data = await response.json();

          if (response.ok && data.webSocketDebuggerUrl) {
            logger.log('chrome debug port responding');
            wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
            logger.log(`websocket url: ${wsUrl}`);
            if (wsUrl) {
              ChromeSession.getInstance().setWsUrl(wsUrl);
            }
            break; // exit retry loop on success
          }
        } catch (err) {
          logger.error(`attempt ${attempts + 1} failed: ${err}`);
        }
        attempts++;
        logger.log(`waiting 1s before retry ${attempts}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!wsUrl) {
        throw new Error('failed to connect to chrome debug port after all attempts');
      }
    }


    return NextResponse.json({
      success: true,
      wsUrl,
      logs: logger.getLogs()
    });
  } catch (err) {
    logger.error(`chrome launch failed with error: ${err}`);
    return NextResponse.json({
      success: false,
      error: String(err),
      logs: logger.getLogs()
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    logger.log('starting DELETE request');
    await quitChrome();
    await quitBrowser(logger);
    logger.log('chrome processes terminated');
    ChromeSession.getInstance().clear();
    logger.log('chrome session cleared');
    return NextResponse.json({ success: true, logs: logger.getLogs() });
  } catch (error) {
    logger.error(`failed to kill chrome: ${error}`);
    return NextResponse.json(
      { success: false, error: String(error), logs: logger.getLogs() },
      { status: 500 }
    );
  }
}

async function quitChrome() {
  const platform = os.platform();
  logger.log(`quitting chrome on platform: ${platform}`);
  const killCommand =
    platform === "win32"
      ? `taskkill /F /IM chrome.exe`
      : `pkill -f -- "Google Chrome"`;

  try {
    logger.log('executing kill command:', killCommand);
    await execPromise(killCommand);
    logger.log("chrome killed successfully");
  } catch (error) {
    logger.log("no chrome process found to kill", error);
  }
}



