import os from 'os'
import { constants } from 'fs';
import { exec } from 'child_process';
import { access } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.searchParams.get('path');
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    await access(path, constants.F_OK);
  } catch (error) {
    return NextResponse.json({ error: 'File does not exist' }, { status: 404 });
  }

  let command: string;
  if (os.platform() === 'win32') {
    command = `powershell.exe -NoProfile -WindowStyle hidden Set-Clipboard -Path "${path}"`;
  } else if (os.platform() === 'darwin') {
    command = `osascript -e 'tell application "Finder" to set the clipboard to (POSIX file "${path}")'`;
  } else {
    return NextResponse.json({ error: 'Unsupported operating system' }, { status: 400 });
  }

  
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if(error) {
        console.error(`Error: ${error.message}`);
        resolve(NextResponse.json({ error: `${error.message}` }, { status: 400 }));
      } else if(stderr) {
        console.error(`Stderr: ${stderr}`);
        resolve(NextResponse.json({ error: `${stderr}` }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ message: 'successfully copied to clipboard', stdout: stdout }, { status: 200 }));
      }
    })
  })
}
