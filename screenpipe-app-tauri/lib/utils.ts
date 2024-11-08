import { platform } from "@tauri-apps/plugin-os";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ContentItem } from "./screenpipe";
import levenshtein from "js-levenshtein";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
// Add this function to your existing utils.ts file
export function stripAnsiCodes(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[JKmsu]/g, "");
}
export function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}

export function keysToCamelCase<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => keysToCamelCase<T>(v)) as any;
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [toCamelCase(key)]: keysToCamelCase(obj[key]),
      }),
      {}
    ) as T;
  }
  return obj;
}

export function encode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
export const convertHtmlToMarkdown = (html: string) => {
  const convertedHtml = html.replace(
    /<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g,
    (match, src, alt) => {
      return `![${alt || ""}](${src})`;
    }
  );
  return convertedHtml.replace(/<[^>]*>/g, "");
};

export function getCliPath() {
  const os = platform();
  switch (os) {
    case "windows":
      return "%LOCALAPPDATA%\\screenpipe\\screenpipe.exe";
    case "macos":
      return "/Applications/screenpipe.app/Contents/MacOS/screenpipe";
    case "linux":
      return "/usr/local/bin/screenpipe";
    default:
      return "screenpipe";
  }
}

// Add this pure function outside of the SearchChat component
export const removeDuplicateSelections = (
  results: ContentItem[],
  selectedResults: Set<number>,
  similarityThreshold: number = 0.9
): Set<number> => {
  const newSelectedResults = new Set<number>();
  const seenContents: string[] = [];

  const getSimilarity = (str1: string, str2: string): number => {
    const maxLength = Math.max(str1.length, str2.length);
    const distance = levenshtein(str1, str2);
    return 1 - distance / maxLength;
  };

  const isDuplicate = (content: string): boolean => {
    return seenContents.some(
      (seenContent) =>
        getSimilarity(content, seenContent) >= similarityThreshold
    );
  };

  Array.from(selectedResults).forEach((index) => {
    const item = results[index];
    if (!item || !item.type) return;

    let content = "";
    if (item.type === "OCR") content = item.content.text;
    else if (item.type === "Audio") content = item.content.transcription;
    else if (item.type === "FTS") content = item.content.matched_text;

    if (!isDuplicate(content)) {
      seenContents.push(content);
      newSelectedResults.add(index);
    }
  });

  return newSelectedResults;
};

export function parseKeyboardShortcut(shortcut: string): string {
  if (typeof window !== "undefined") {
    const os = platform();

    const uniqueKeys = new Set(
      shortcut
        .toLowerCase()
        .split("+")
        .map((key) => key.trim())
    );

    return Array.from(uniqueKeys)
      .map((key) => {
        if (key === "super") {
          return os === "macos" ? "⌘" : "⊞";
        }
        if (key === "ctrl") return "⌃";
        if (key === "alt") return os === "macos" ? "⌥" : "Alt";
        if (key === "shift") return "⇧";
        return key.charAt(0).toUpperCase() + key.slice(1);
      })
      .join(" + ");
  }
  return "";
}

export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ("00" + value.toString(16)).substr(-2);
  }
  return color;
}
