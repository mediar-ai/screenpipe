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
exports.MarkdownWithExternalLinks = void 0;
const react_1 = __importDefault(require("react"));
const remark_gfm_1 = __importDefault(require("remark-gfm"));
const remark_math_1 = __importDefault(require("remark-math"));
const markdown_1 = require("@/components/markdown");
const MarkdownWithExternalLinks = ({ children, className }) => {
    return (<markdown_1.MemoizedReactMarkdown className={className} remarkPlugins={[remark_gfm_1.default, remark_math_1.default]} components={{
            a: (_a) => {
                var { node, href, children } = _a, props = __rest(_a, ["node", "href", "children"]);
                return (<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>);
            },
        }}>
      {children.toString()}
    </markdown_1.MemoizedReactMarkdown>);
};
exports.MarkdownWithExternalLinks = MarkdownWithExternalLinks;
