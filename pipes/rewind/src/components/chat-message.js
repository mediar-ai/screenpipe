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
exports.ChatMessage = ChatMessage;
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const utils_1 = require("@/lib/utils");
const codeblock_1 = require("@/components/ui/codeblock");
const markdown_1 = require("@/components/markdown");
const icons_1 = require("@/components/ui/icons");
const chat_message_actions_1 = require("@/components/chat-message-actions");
const use_settings_1 = require("@/lib/hooks/use-settings");
const video_1 = require("./video");
function ChatMessage(_a) {
    var _b;
    var { message } = _a, props = __rest(_a, ["message"]);
    const { settings } = (0, use_settings_1.useSettings)();
    const hasMP4File = (content) => content.trim().toLowerCase().includes(".mp4");
    if (!((_b = message === null || message === void 0 ? void 0 : message.content) === null || _b === void 0 ? void 0 : _b.trim())) {
        return null;
    }
    return (<div className={(0, utils_1.cn)("group relative mb-4 flex items-start w-full")} {...props}>
      <div className={(0, utils_1.cn)("flex size-8 shrink-0 select-none items-center justify-center rounded-md border shadow", message.role === "user"
            ? "bg-background"
            : "bg-primary text-primary-foreground")}>
        {message.role === "user" ? (<icons_1.IconUser />) : settings.aiUrl.includes("openai") ||
            settings.aiUrl.includes("worker") ? (<icons_1.IconOpenAI />) : (<>🦙</>)}
      </div>
      <div className="flex-1 px-1 ml-4 space-y-2 overflow-hidden w-[96em]">
        <markdown_1.MemoizedReactMarkdown className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-full" remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
            },
            a(_a) {
                var { node, href, children } = _a, props = __rest(_a, ["node", "href", "children"]);
                const isMP4Link = href === null || href === void 0 ? void 0 : href.toLowerCase().includes(".mp4");
                if (isMP4Link && href) {
                    return <video_1.VideoComponent filePath={href}/>;
                }
                return (<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>);
            },
            code(_a) {
                var { node, className, children } = _a, props = __rest(_a, ["node", "className", "children"]);
                const content = String(children).replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");
                const isMP4File = hasMP4File(content);
                if (isMP4File || !match) {
                    if (isMP4File) {
                        return <video_1.VideoComponent filePath={content.trim()}/>;
                    }
                    return (<code className="px-1 py-0.5 rounded-sm font-mono text-sm" {...props}>
                    {content}
                  </code>);
                }
                return (<codeblock_1.CodeBlock key={Math.random()} language={(match && match[1]) || ""} value={content} {...props}/>);
            },
        }}>
          {message.content}
        </markdown_1.MemoizedReactMarkdown>
        <chat_message_actions_1.ChatMessageActions message={message}/>
      </div>
    </div>);
}
