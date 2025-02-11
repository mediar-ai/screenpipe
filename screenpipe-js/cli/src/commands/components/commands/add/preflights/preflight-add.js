"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preFlightAdd = preFlightAdd;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const handle_error_1 = require("../utils/handle-error");
function preFlightAdd(cwd) {
    const errors = {};
    // Ensure target directory exists.
    // Check for empty project. We assume if no package.json exists, the project is empty.
    if (!fs_1.default.existsSync(cwd) ||
        !fs_1.default.existsSync(path_1.default.resolve(cwd, "package.json"))) {
        errors[handle_error_1.ERRORS.MISSING_DIR_OR_EMPTY_PIPE] = true;
        return {
            errors
        };
    }
}
