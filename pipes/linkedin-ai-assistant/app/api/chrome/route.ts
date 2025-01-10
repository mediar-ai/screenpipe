import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { quitBrowser } from '@/lib/browser-setup';
import os from 'os';

export const runtime = 'nodejs'; // specify node runtime

const execPromise = promisify(exec);

// helper to get chrome path based on platform
function getChromePath() {
  switch (os.platform()) {
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':
      return '/usr/bin/google-chrome';
    case 'win32':
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:
      throw new Error('unsupported platform');
  }
}

export async function POST() {
  try {
    console.log('attempting to launch chrome');

    await quitChrome();
    await quitBrowser();

    const chromePath = getChromePath();
    const chromeProcess = spawn(chromePath, [
      '--remote-debugging-port=9222',
      '--restore-last-session',
      '--no-first-run', // add these flags for better stability
      '--no-default-browser-check'
    ], { 
      detached: true, 
      stdio: 'ignore' 
    });

    chromeProcess.unref();

    // increase timeout to ensure chrome is ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // verify chrome is running by checking debug port
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (!response.ok) {
        throw new Error('chrome debug port not responding');
      }
    } catch {
      throw new Error('failed to connect to chrome debug port');
    }

    console.log('chrome launch confirmed');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('failed to launch chrome:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await quitChrome();
    await quitBrowser();
    console.log('chrome process terminated');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('failed to kill chrome:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function quitChrome() {
  const killCommand = `pkill -f -- "Google Chrome"`;
  try {
    await execPromise(killCommand);
    console.log('chrome killed');
  } catch (error) {
    console.log('no chrome process found to kill', error);
  }
}