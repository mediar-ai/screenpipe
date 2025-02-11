"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeStoreMarkdown = PipeStoreMarkdown;
const markdown_1 = require("@/components/markdown");
const codeblock_1 = require("@/components/ui/codeblock");
const react_1 = require("react");
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const utils_1 = require("@/lib/utils");
function PipeStoreMarkdown({ content, className, variant = "default", }) {
    const { isCopied, copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 2000 });
    const processedContent = (0, utils_1.convertHtmlToMarkdown)(content);
    return (<div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <markdown_1.MemoizedReactMarkdown remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p({ children }) {
                return <span className="mb-2 last:mb-0">{children}</span>;
            },
            code(_a) {
                var { node, className, children } = _a, props = __rest(_a, ["node", "className", "children"]);
                const content = String(children).replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");
                return match ? (<codeblock_1.CodeBlock key={Math.random()} language={(match && match[1]) || ""} value={content} {...props}/>) : (<code className="relative group py-0.5 px-1 rounded-sm font-mono text-sm text-grey-900 inline-block" {...props}>
                {content}
                <button_1.Button size="icon" variant="ghost" className="absolute -right-3 -top-3 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6" onClick={() => copyToClipboard(content)}>
                  {isCopied ? (<lucide_react_1.Check className="h-3 w-3"/>) : (<lucide_react_1.Copy className="h-3 w-3"/>)}
                </button_1.Button>
              </code>);
            },
            a({ href, children }) {
                const isDirectVideo = (href === null || href === void 0 ? void 0 : href.match(/\.(mp4|webm|ogg)$/)) ||
                    (href === null || href === void 0 ? void 0 : href.includes("user-attachments/assets"));
                const youtubeMatch = href === null || href === void 0 ? void 0 : href.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/);
                if (isDirectVideo || youtubeMatch) {
                    return (<span className="block">
                  {isDirectVideo ? (<RetryableVideo src={href} maxRetries={3} retryDelay={1000}/>) : (<iframe width="100%" height="315" src={`https://www.youtube.com/embed/${youtubeMatch[1]}`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="max-w-full" style={{ maxHeight: "400px" }}/>)}
                </span>);
                }
                return (<a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>);
            },
            img(_a) {
                var { node } = _a, props = __rest(_a, ["node"]);
                return (<img {...props} className="max-w-full h-auto rounded-lg" style={{ maxHeight: "600px" }}/>);
            },
        }}>
        {processedContent.replace(/Â/g, "")}
      </markdown_1.MemoizedReactMarkdown>
    </div>);
}
const RetryableVideo = ({ src, maxRetries = 3, retryDelay = 1000, }) => {
    const [retries, setRetries] = (0, react_1.useState)(0);
    const [key, setKey] = (0, react_1.useState)(0);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const handleError = (e) => {
        console.error("video loading error:", e);
        if (retries < maxRetries) {
            setTimeout(() => {
                setRetries(retries + 1);
                setKey(key + 1);
            }, retryDelay);
        }
    };
    return (<div className="relative">
      {isLoading && (<div className="absolute inset-0 animate-pulse bg-zinc-800 rounded-md"/>)}
      <video key={key} src={src} controls className="max-w-full h-auto" style={{ maxHeight: "400px" }} onError={handleError} onLoadStart={() => {
            console.log("video load started:", src);
            setIsLoading(true);
        }} onLoadedData={() => {
            console.log("video data loaded:", src);
            setIsLoading(false);
        }}>
        your browser does not support the video tag.
      </video>
    </div>);
};
