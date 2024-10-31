import fs from 'fs';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';

let isAudio = false;

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  console.log("query received:", req.query);

  const videoPath = req.query?.path as string;
  if (!videoPath || typeof videoPath !== 'string') {
    return res.status(400).json({ error: 'file path is required' });
  }

  try {
    const fullPath = path.resolve(videoPath);
    console.log(`attempting to access file: ${fullPath}`);

    if (fullPath.includes('input') || fullPath.includes('output')){
      isAudio = true;
    }
    const fileStream = fs.createReadStream(fullPath);
    const contentType = getContentType(fullPath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Error fetching file:', error);
    if (error.code === 'ENOENT') {
      console.error('Error: File not found');
      return res.status(404).json({ error: 'File not found' });
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied');
      return res.status(403).json({ error: 'Permission denied' });
    } else {
      console.error('Unexpected error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
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
