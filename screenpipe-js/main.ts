// main.ts - Universal entry point
export * from "./types";
export { toCamelCase, toSnakeCase, convertToCamelCase } from "./next";

// Browser-only exports
export { sendDesktopNotification, queryScreenpipe, input } from "./browser";

// Export browser pipe as default
export { pipe as default } from "./browser";

// Note: Node-specific functionality is not exported in browser bundle
// It will be handled by the package.json "exports" field
