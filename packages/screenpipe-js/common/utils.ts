// utils.ts — Shared helpers for screenpipe JS SDK

export function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function convertObjectToCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertObjectToCamelCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>).reduce(
      (result, key) => {
        const camelKey = toCamelCase(key);
        result[camelKey] = convertObjectToCamelCase(
          (obj as Record<string, unknown>)[key]
        );
        return result;
      },
      {} as Record<string, unknown>
    );
  }
  return obj;
}

export function convertObjectToSnakeCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertObjectToSnakeCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>).reduce(
      (result, key) => {
        const snakeKey = toSnakeCase(key);
        result[snakeKey] = convertObjectToSnakeCase(
          (obj as Record<string, unknown>)[key]
        );
        return result;
      },
      {} as Record<string, unknown>
    );
  }
  return obj;
}
