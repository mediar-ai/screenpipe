'use server';
import { resolve } from 'node:path'
import { unlink } from 'node:fs/promises';

export async function deleteFile(filePath: string): Promise<void>{
  try{
    const absolutePath = resolve(filePath)
    console.log("AbsolutePath:", absolutePath)
    // await unlink(absolutePath);
  } catch(error) {
    console.error(`Failed to delete file: ${filePath}`, error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
