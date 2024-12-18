import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
