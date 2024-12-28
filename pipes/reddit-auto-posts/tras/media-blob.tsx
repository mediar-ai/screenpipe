"use client";
import { getMediaFile } from '@/lib/actions/video-actions';

const validateMedia = async(path: string): Promise<string> => {
  try {
    const response = await fetch(`http://localhost:3030/experimental/validate/media?file_path=${encodeURIComponent(path)}`);
    const result = await response.json();
    return result.status;
  } catch (error) {
    console.error("Failed to validate media:", error);
    return "Failed to validate media";
  }
};

const sanitizeFilePath = (path: string): string => {
  const isWindows = navigator.userAgent.includes("Windows");
  if (isWindows) {
    return path;
  }
  return path
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\//g, "/");
};

const getBlobUrl = async (filePath: string): 
  Promise<{
  blobUrl: string,
  isAudio: boolean
} | null> => {
  try {
    const sanitizedPath = sanitizeFilePath(filePath);
    const validationStatus = await validateMedia(sanitizedPath);
    const isAudio = sanitizedPath.toLowerCase().includes("input") 
      || sanitizedPath.toLowerCase().includes("output");
    console.log("Media file:", validationStatus);

    if (validationStatus === "valid media file") {

      const {data, mimeType} = await getMediaFile(sanitizedPath);
      const binaryData = atob(data);
      const bytes = new Uint8Array(binaryData.length)

      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType })
      const blobUrl = URL.createObjectURL(blob);

      return { blobUrl, isAudio };
    } else if (validationStatus.startsWith("media file does not exist")) {
      throw new Error(`${isAudio ? "audio" : "video"} file not exists, it might get deleted`);
    } else if (validationStatus.startsWith("invalid media file")) {
      throw new Error(`the ${isAudio ? "audio" : "video"} file is not written completely, please try again later`);
    } else {
      throw new Error("unknown media validation status");
    }
  } catch (error) {
    console.error('Error loading media:', error);
    return null;
  }
};

export default getBlobUrl;
