"use strict";
// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Markdown/CodeBlock.tsx
"use client";
// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Markdown/CodeBlock.tsx
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeBlock = exports.generateRandomString = exports.programmingLanguages = void 0;
const react_1 = require("react");
const react_syntax_highlighter_1 = require("react-syntax-highlighter");
const prism_1 = require("react-syntax-highlighter/dist/cjs/styles/prism");
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const icons_1 = require("@/components/ui/icons");
const button_1 = require("@/components/ui/button");
exports.programmingLanguages = {
    javascript: ".js",
    python: ".py",
    java: ".java",
    c: ".c",
    cpp: ".cpp",
    "c++": ".cpp",
    "c#": ".cs",
    ruby: ".rb",
    php: ".php",
    swift: ".swift",
    "objective-c": ".m",
    kotlin: ".kt",
    typescript: ".ts",
    go: ".go",
    perl: ".pl",
    rust: ".rs",
    scala: ".scala",
    haskell: ".hs",
    lua: ".lua",
    shell: ".sh",
    sql: ".sql",
    html: ".html",
    css: ".css",
    // add more file extensions here, make sure the key is same as language prop in CodeBlock.tsx component
};
const generateRandomString = (length, lowercase = false) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXY3456789"; // excluding similar looking characters like Z, 2, I, 1, O, 0
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return lowercase ? result.toLowerCase() : result;
};
exports.generateRandomString = generateRandomString;
const CodeBlock = (0, react_1.memo)(({ language, value }) => {
    const { isCopied, copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 2000 });
    const downloadAsFile = () => {
        if (typeof window === "undefined") {
            return;
        }
        const fileExtension = exports.programmingLanguages[language] || ".file";
        const suggestedFileName = `file-${(0, exports.generateRandomString)(3, true)}${fileExtension}`;
        const fileName = window.prompt("Enter file name", suggestedFileName);
        if (!fileName) {
            // User pressed cancel on prompt.
            return;
        }
        const blob = new Blob([value], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileName;
        link.href = url;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const onCopy = () => {
        if (isCopied)
            return;
        copyToClipboard(value);
    };
    return (<div className="relative w-full font-sans codeblock bg-zinc-950">
      <div className="flex items-center justify-between w-full px-6 py-2 pr-4 bg-zinc-800 text-zinc-100">
        <span className="text-xs lowercase">{language}</span>
        <div className="flex items-center space-x-1">
          <button_1.Button variant="ghost" className="hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0" onClick={downloadAsFile} size="icon">
            <icons_1.IconDownload />
            <span className="sr-only">Download</span>
          </button_1.Button>
          <button_1.Button variant="ghost" size="icon" className="text-xs hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0" onClick={onCopy}>
            {isCopied ? <icons_1.IconCheck /> : <icons_1.IconCopy />}
            <span className="sr-only">Copy code</span>
          </button_1.Button>
        </div>
      </div>
      <react_syntax_highlighter_1.Prism language={language} style={prism_1.coldarkDark} PreTag="div" showLineNumbers customStyle={{
            margin: 0,
            width: "100%",
            background: "transparent",
            padding: "1.5rem 1rem",
        }} lineNumberStyle={{
            userSelect: "none",
        }} codeTagProps={{
            style: {
                fontSize: "0.9rem",
                fontFamily: "var(--font-mono)",
            },
        }}>
        {value}
      </react_syntax_highlighter_1.Prism>
    </div>);
});
exports.CodeBlock = CodeBlock;
CodeBlock.displayName = "CodeBlock";
