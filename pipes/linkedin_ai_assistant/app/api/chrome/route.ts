import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { quitBrowser } from '@/lib/browser_setup';
const execPromise = promisify(exec);

export async function POST() {
  try {
    console.log('attempting to launch chrome');

    // Kill any existing Chrome instances first
    await quitChrome();
    await quitBrowser();

    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const chromeLaunchCommand = `"${chromePath}" --remote-debugging-port=9222 --restore-last-session`;
    const chromeProcess = exec(chromeLaunchCommand, { detached: true, stdio: 'ignore' });

    chromeProcess.unref();

    // Give Chrome a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('chrome launch initiated');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('failed to launch chrome:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
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
    console.log('no chrome process found to kill');
  }
}