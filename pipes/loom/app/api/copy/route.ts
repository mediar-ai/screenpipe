import { exec } from 'child_process';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  const command = `powershell.exe -NoProfile -WindowStyle hidden -File copyToClipboard.ps1 -FilePath "${path}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return NextResponse.json({error: `${error.message}`}, { status: 400 });
    }
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
      return NextResponse.json({error: `${stderr}`}, { status: 500 });
    }
    return NextResponse.json({message: 'sucessfully copied to clipboard', stdout: stdout}, {status: 200});
  });

  return NextResponse.json({message: 'sucessfully copied to clipboard'}, {status: 200});
}
