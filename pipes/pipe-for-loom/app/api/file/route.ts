import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

let isAudio = false;

export async function GET(req: NextRequest) {
  const videoPath = req.nextUrl.searchParams.get('path');
  if (!videoPath || typeof videoPath !== 'string') {
    return NextResponse.json({ error: 'file path is required' }, { status: 400 });
  }

  try {
    const fullPath = path.resolve(videoPath);
    console.log(`attempting to access file: ${fullPath}`);

    if (fullPath.includes('input') || fullPath.includes('output')){
      isAudio = true;
    }
    const fileStream = fs.createReadStream(fullPath);
    const contentType = getContentType(fullPath);

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');

    const transform = new TransformStream();
    const writer = transform.writable.getWriter();
    
    fileStream.on('data', (chunk) => writer.write(chunk));
    fileStream.on('end', () => writer.close());
    
    return new Response(transform.readable, { headers });
  } catch (error :any) {
    console.error('Error fetching file:', error);
    if (error.code === 'ENOENT') {
      console.error('Error: File not found');
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied');
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    } else {
      console.error('Unexpected error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    default:
      return isAudio ? "audio/mpeg" : "video/mp4";;
  }
}


