import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { quitBrowser } from '@/lib/browser-setup';
import os from 'os';
import { ChromeSession } from '@/lib/chrome-session';
// import { pipe } from "@screenpipe/js";

const logs: string[] = [];
const addLog = (msg: string) => {
  console.log(msg);
  logs.push(`${new Date().toISOString()} - ${msg}`);
};

export const runtime = 'nodejs'; // specify node runtime

const execPromise = promisify(exec);

// helper to get chrome path based on platform
function getChromePath() {
  switch (os.platform()) {
    case "darwin": {
      const isArm = os.arch() === 'arm64';
      addLog(`mac architecture: ${os.arch()}`);
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
        addLog(`using client screen dimensions: ${requestDims.width}x${requestDims.height}`);
        return requestDims;
    }
    
    addLog(`no dimensions provided, using defaults: ${defaultDims.width}x${defaultDims.height}`);
    return defaultDims;
}

export async function POST(request: Request) {
  try {
    addLog('chrome route: starting POST request');
    
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
    addLog(`environment: ${process.env.NODE_ENV}`);
    addLog(`current platform: ${os.platform()}`);
    addLog(`system architecture: ${os.arch()}`);
    addLog(`cpu info: ${JSON.stringify(os.cpus()[0], null, 2)}`);

    addLog("attempting to launch chrome");
    addLog("killing existing chrome instances...");
    await quitChrome();
    await quitBrowser(logs);

    const chromePath = getChromePath();
    addLog(`using chrome path: ${chromePath}`);
    addLog(`checking if chrome exists: ${require('fs').existsSync(chromePath)}`);

    addLog("spawning chrome with debugging port 9222...");
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
    addLog("chrome process spawned and detached");

    addLog("waiting for chrome to initialize...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    let attempts = 0;
    const maxAttempts = 5;
    addLog(`attempting to connect to debug port (max ${maxAttempts} attempts)`);

    while (attempts < maxAttempts) {
      try {
        addLog(`connection attempt ${attempts + 1}/${maxAttempts}`);
        const response = await fetch('http://127.0.0.1:9222/json/version');
        const data = await response.json();
        
        if (response.ok && data.webSocketDebuggerUrl) {
          addLog('chrome debug port responding');
          const wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
          addLog(`websocket url: ${wsUrl}`);
          ChromeSession.getInstance().setWsUrl(wsUrl);
          
          return NextResponse.json({ 
            success: true,
            wsUrl,
            logs
          });
        }
      } catch (err) {
        addLog(`attempt ${attempts + 1} failed: ${err}`);
      }
      attempts++;
      addLog(`waiting 1s before retry ${attempts}/${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('failed to connect to chrome debug port after all attempts');
  } catch (err) {
    addLog(`chrome launch failed with error: ${err}`);
    return NextResponse.json({ 
      success: false, 
      error: String(err),
      logs
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    addLog('chrome route: starting DELETE request');
    await quitChrome();
    await quitBrowser(logs);
    addLog('chrome processes terminated');
    ChromeSession.getInstance().clear();
    addLog('chrome session cleared');
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    addLog(`failed to kill chrome: ${error}`);
    return NextResponse.json(
      { success: false, error: String(error), logs },
      { status: 500 }
    );
  }
}

async function quitChrome() {
  const platform = os.platform();
  console.log('quitting chrome on platform:', platform);
  const killCommand =
    platform === "win32"
      ? `taskkill /F /IM chrome.exe`
      : `pkill -f -- "Google Chrome"`;

  try {
    console.log('executing kill command:', killCommand);
    await execPromise(killCommand);
    console.log("chrome killed successfully");
  } catch (error) {
    console.log("no chrome process found to kill", error);
  }
}



