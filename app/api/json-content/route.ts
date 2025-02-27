import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json({ error: 'No path provided' }, { status: 400 });
    }
    
    // Resolve the path relative to the project root
    // Adjust this path as needed for your project structure
    const fullPath = path.join(process.cwd(), filePath);
    
    // Security check to prevent directory traversal
    if (!fullPath.startsWith(process.cwd())) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }
    
    // Read the file
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const jsonContent = JSON.parse(fileContent);
    
    return NextResponse.json(jsonContent);
  } catch (error) {
    console.error('Error reading JSON content:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 