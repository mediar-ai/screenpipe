"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.highlighter = void 0;
exports.spinner = spinner;
const ora_1 = __importDefault(require("ora"));
const colors_1 = require("../../../../../utils/colors");
exports.highlighter = {
    error: colors_1.colors.error,
    warn: colors_1.colors.warning,
    info: colors_1.colors.info,
    success: colors_1.colors.success,
};
exports.logger = {
    error(...args) {
        console.log(exports.highlighter.error(args.join(" ").toLowerCase()));
    },
    warn(...args) {
        console.log(exports.highlighter.warn(args.join(" ").toLowerCase()));
    },
    info(...args) {
        console.log(exports.highlighter.info(args.join(" ").toLowerCase()));
    },
    success(...args) {
        console.log(exports.highlighter.success(args.join(" ").toLowerCase()));
    },
    log(...args) {
        console.log(args.join(" ").toLowerCase());
    },
    break() {
        console.log("");
    },
};
function spinner(text, options) {
    return (0, ora_1.default)({
        text,
        isSilent: options === null || options === void 0 ? void 0 : options.silent,
    });
}
