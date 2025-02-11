"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertHtmlToMarkdown = void 0;
exports.cn = cn;
exports.stripAnsiCodes = stripAnsiCodes;
exports.toCamelCase = toCamelCase;
exports.keysToCamelCase = keysToCamelCase;
exports.encode = encode;
exports.stringToColor = stringToColor;
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
