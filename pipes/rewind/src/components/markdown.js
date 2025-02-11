"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoizedReactMarkdown = void 0;
const react_1 = require("react");
const react_markdown_1 = __importDefault(require("react-markdown"));
exports.MemoizedReactMarkdown = (0, react_1.memo)(react_markdown_1.default, (prevProps, nextProps) => prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className);
