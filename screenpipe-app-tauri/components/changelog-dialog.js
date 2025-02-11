"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
exports.ChangelogDialog = void 0;
const react_1 = __importStar(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const use_changelog_dialog_1 = require("@/lib/hooks/use-changelog-dialog");
const markdown_1 = require("./markdown");
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const codeblock_1 = require("./ui/codeblock");
const ChangelogDialog = () => {
    const [changelogContent, setChangelogContent] = (0, react_1.useState)("");
    const { showChangelogDialog, setShowChangelogDialog } = (0, use_changelog_dialog_1.useChangelogDialog)();
    (0, react_1.useEffect)(() => {
        const fetchChangelog = () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield fetch("/CHANGELOG.md");
            const text = yield response.text();
            setChangelogContent(text);
        });
        fetchChangelog();
    }, []);
    const onClose = () => setShowChangelogDialog(false);
    return (<dialog_1.Dialog open={showChangelogDialog} onOpenChange={onClose}>
      <dialog_1.DialogContent className="w-11/12 max-w-6xl p-6 h-[80vh] overflow-auto">
        <div className="max-w-max prose prose-medium prose-slate w-full h-full">
          <h1>Changelog</h1>
          <markdown_1.MemoizedReactMarkdown 
    // className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
    remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
            },
            a(_a) {
                var { node, href, children } = _a, props = __rest(_a, ["node", "href", "children"]);
                return (<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>);
            },
            code(_a) {
                var { node, className, children } = _a, props = __rest(_a, ["node", "className", "children"]);
                const content = String(children).replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");
                if (!match) {
                    return (<code className="px-1 py-0.5 rounded-sm font-mono text-sm" {...props}>
                      {content}
                    </code>);
                }
                return (<codeblock_1.CodeBlock key={Math.random()} language={(match && match[1]) || ""} value={content} {...props}/>);
            },
        }}>
            {changelogContent}
          </markdown_1.MemoizedReactMarkdown>
        </div>
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
};
exports.ChangelogDialog = ChangelogDialog;
