"use strict";
"use client";
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
};
const generateRandomString = (length, lowercase = false) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXY3456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return lowercase ? result.toLowerCase() : result;
};
exports.generateRandomString = generateRandomString;
const CodeBlock = (0, react_1.memo)(({ className, language, value }) => {
    const { isCopied, copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 2000 });
    const onCopy = () => {
        if (isCopied)
            return;
        copyToClipboard(value);
    };
    return (<div className={` relative w-full font-sans codeblock backdrop-blur-sm bg-zinc-950 ${className}`}>
      <react_syntax_highlighter_1.Prism language={language} style={prism_1.coldarkDark} PreTag="div" customStyle={{
            margin: 0,
            width: "100%",
            background: "transparent",
            padding: "10px 8px",
        }} codeTagProps={{
            style: {
                fontSize: "0.85rem",
                fontFamily: "var(--font-mono)",
            },
        }}>
        {value}
      </react_syntax_highlighter_1.Prism>
      <div className="absolute rounded-md z-[100] items-center right-0 top-[2px] text-zinc-100 bg-zinc-950">
        <button_1.Button title="Copy" variant="ghost" size="icon" className="text-xs hover:text-zinc-200/80 hover:bg-zinc-950" onClick={onCopy}>
          {isCopied ? <icons_1.IconCheck /> : <icons_1.IconCopy />}
          <span className="sr-only">Copy code</span>
        </button_1.Button>
      </div>
    </div>);
});
exports.CodeBlock = CodeBlock;
CodeBlock.displayName = "CodeBlock";
