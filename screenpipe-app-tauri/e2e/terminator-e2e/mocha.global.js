const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let appProcess;
let terminatorProcess;

function findExecutablePath() {
  const paths = [
    path.join(__dirname, '../../src-tauri/target/release/screenpipe-app.exe'),
    path.join(__dirname, '../../src-tauri/target/x86_64-pc-windows-msvc/release/screenpipe-app.exe')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('could not find screenpipe-app.exe in any of the expected locations');
}

function findTerminatorServerPath() {
  const serverPath = path.join(__dirname, 'terminator-server-windows-x86_64', 'server.exe');
  if (fs.existsSync(serverPath)) return serverPath;
  throw new Error('could not find terminator server exe in expected location');
}

function killProcess(proc) {
  if (!proc) return;
  const pid = proc.pid;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`);
    } catch (e) { /* ignore */ }
  } else {
    try {
      process.kill(-pid);
    } catch (e) { /* ignore */ }
  }
}

exports.mochaHooks = {
  async beforeAll() {
    const exePath = findExecutablePath();
    const terminatorPath = findTerminatorServerPath();
    appProcess = spawn(exePath, [], { stdio: 'ignore', detached: true });
    terminatorProcess = spawn(terminatorPath, [], { stdio: 'ignore', detached: true });
    await new Promise(res => setTimeout(res, 4000));
  },
  afterAll() {
    killProcess(appProcess);
    killProcess(terminatorProcess);
  }
}; 