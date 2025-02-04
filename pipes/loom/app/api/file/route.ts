import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const videoPath = req.nextUrl.searchParams.get('path');
  if (!videoPath || typeof videoPath !== 'string') {
    return NextResponse.json({ error: 'file path is required' }, { status: 400 });
  }

  try {
    const fullPath = path.resolve(videoPath);
    console.log(`Attempting to access file: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
      console.error('Error: File not found');
      return NextResponse.json({error: 'File not found'}, {status: 404});
    }
    
    const fileStream = fs.createReadStream(fullPath);
    const contentType = getMimeType(fullPath);

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');

    let controllerClosed = false;
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          if(!controllerClosed) {
            controller.enqueue(chunk);
          }
        });
        fileStream.on('end', () => {
          if (!controllerClosed) {
            controller.close();
            controllerClosed = true;
          }
        });
        fileStream.on('error', (err) => {
          if (!controllerClosed) {
            controller.error(err);
            controllerClosed = true;
          }
        });
      },
      cancel() {
        controllerClosed = true;
        fileStream.destroy();
      }
    })

    return new NextResponse(readableStream, { headers });
  } catch (error :any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const getMimeType = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase()
  const isAudio = path.toLowerCase().includes('input') 
    || path.toLowerCase().includes('output')
  switch (ext) {
    case 'mp4': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'ogg': return 'video/ogg'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    default: return isAudio ? 'audio/mpeg' : 'video/mp4'
  }
}

