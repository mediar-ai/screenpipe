import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request) {
  try {
    // Get the URL and extract the path parameter
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    
    console.log("api: requested component source for path:", filePath);
    
    if (!filePath) {
      console.log("api: no path provided");
      return NextResponse.json({ error: 'no path provided' }, { status: 400 });
    }
    
    // Security: Ensure the path doesn't try to access files outside the project
    // by normalizing it and checking for path traversal attempts
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    // Resolve the absolute path from the project root
    const projectRoot = process.cwd();
    
    // Remove any leading slash and strip out any reference to the project structure
    // This fixes the duplicate path issue
    const cleanPath = normalizedPath
      .replace(/^\//, '')
      .replace(/^pipes\/example-pipe\//, '');
    
    console.log("api: normalized path:", normalizedPath);
    console.log("api: clean path after stripping prefix:", cleanPath);
    
    const absolutePath = path.join(projectRoot, cleanPath);
    
    console.log("api: attempting to read file at:", absolutePath);
    console.log("api: project root is:", projectRoot);
    
    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch (error) {
      console.log("api: file not found:", absolutePath);
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
    }
    
    // Read the file
    const content = await fs.readFile(absolutePath, 'utf-8');
    console.log("api: successfully read file, length:", content.length);
    
    // Return the file content
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    console.error("api: error serving component source:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}