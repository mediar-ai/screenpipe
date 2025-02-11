"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.symbols = exports.colors = void 0;
const chalk_1 = __importDefault(require("chalk"));
exports.colors = {
    primary: chalk_1.default.cyan,
    success: chalk_1.default.green,
    error: chalk_1.default.red,
    warning: chalk_1.default.yellow,
    info: chalk_1.default.blue,
    dim: chalk_1.default.gray,
    highlight: chalk_1.default.magenta,
    bold: chalk_1.default.bold,
    header: (text) => chalk_1.default.bold.cyan(`\n${text}`),
    subHeader: (text) => chalk_1.default.dim(`${text}`),
    listItem: (text) => chalk_1.default.cyan(`  * ${text}`),
    label: (text) => chalk_1.default.bold.blue(`${text}:`),
    value: (text) => chalk_1.default.white(`${text}`),
};
exports.symbols = {
    success: '+',
    error: 'x',
    warning: '!',
    info: 'i',
    arrow: '>',
};
