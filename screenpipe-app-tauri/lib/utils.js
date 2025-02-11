"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unflattenObject = exports.flattenObject = exports.convertHtmlToMarkdown = void 0;
exports.cn = cn;
exports.stripAnsiCodes = stripAnsiCodes;
exports.toCamelCase = toCamelCase;
exports.keysToCamelCase = keysToCamelCase;
exports.encode = encode;
exports.getCliPath = getCliPath;
exports.parseKeyboardShortcut = parseKeyboardShortcut;
exports.stringToColor = stringToColor;
exports.getFileSize = getFileSize;
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
// Add this function to your existing utils.ts file
function stripAnsiCodes(str) {
    return str.replace(/\x1B\[[0-9;]*[JKmsu]/g, "");
}
function toCamelCase(str) {
    return str.replace(/([-_][a-z])/g, (group) => group.toUpperCase().replace("-", "").replace("_", ""));
}
function keysToCamelCase(obj) {
    if (Array.isArray(obj)) {
        return obj.map((v) => keysToCamelCase(v));
    }
    else if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => (Object.assign(Object.assign({}, result), { [toCamelCase(key)]: keysToCamelCase(obj[key]) })), {});
    }
    return obj;
}
function encode(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
        return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
}
const convertHtmlToMarkdown = (html) => {
    const convertedHtml = html.replace(/<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g, (match, src, alt) => {
        return `![${alt || ""}](${src})`;
    });
    return convertedHtml.replace(/<[^>]*>/g, "");
};
exports.convertHtmlToMarkdown = convertHtmlToMarkdown;
function getCliPath() {
    const os = (0, plugin_os_1.platform)();
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
function parseKeyboardShortcut(shortcut) {
    if (typeof window !== "undefined") {
        const os = (0, plugin_os_1.platform)();
        const uniqueKeys = new Set(shortcut
            .toLowerCase()
            .split("+")
            .map((key) => key.trim()));
        return Array.from(uniqueKeys)
            .map((key) => {
            if (key === "super") {
                return os === "macos" ? "⌘" : "⊞";
            }
            if (key === "ctrl")
                return "⌃";
            if (key === "alt")
                return os === "macos" ? "⌥" : "Alt";
            if (key === "shift")
                return "⇧";
            return key.charAt(0).toUpperCase() + key.slice(1);
        })
            .join(" + ");
    }
    return "";
}
function stringToColor(str) {
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
function getFileSize(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const { size } = yield (0, plugin_fs_1.stat)(filePath);
        return size;
    });
}
// Helper functions to flatten/unflatten objects
const flattenObject = (obj, prefix = "") => {
    return Object.keys(obj).reduce((acc, k) => {
        const pre = prefix.length ? prefix + "." : "";
        if (typeof obj[k] === "object" &&
            obj[k] !== null &&
            !Array.isArray(obj[k])) {
            Object.assign(acc, (0, exports.flattenObject)(obj[k], pre + k));
        }
        else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {});
};
exports.flattenObject = flattenObject;
const unflattenObject = (obj) => {
    const result = {};
    for (const key in obj) {
        const keys = key.split(".");
        let current = result;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (i === keys.length - 1) {
                current[k] = obj[key];
            }
            else {
                current[k] = current[k] || {};
                current = current[k];
            }
        }
    }
    return result;
};
exports.unflattenObject = unflattenObject;
