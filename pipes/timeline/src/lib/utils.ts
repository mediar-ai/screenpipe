import { ContentItem } from "@screenpipe/js";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import levenshtein from "js-levenshtein";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
    else if (item.type === "UI") content = item.content.text;

    if (!isDuplicate(content)) {
      seenContents.push(content);
      newSelectedResults.add(index);
    }
  });

  return newSelectedResults;
};

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
