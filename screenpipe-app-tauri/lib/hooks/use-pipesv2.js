"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipes = void 0;
const react_1 = require("react");
const convertHtmlToMarkdown = (html) => {
    const convertedHtml = html.replace(/<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g, (match, src, alt) => {
        return `![${alt || ""}](${src})`;
    });
    return convertedHtml.replace(/<[^>]*>/g, "");
};
const usePipes = (initialRepoUrls) => {
    const [pipes, setPipes] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    return { pipes, loading, error };
};
exports.usePipes = usePipes;
