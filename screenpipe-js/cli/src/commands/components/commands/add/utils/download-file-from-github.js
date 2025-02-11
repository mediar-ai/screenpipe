"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFileFromGitHubAPI = fetchFileFromGitHubAPI;
const fs_extra_1 = __importDefault(require("fs-extra"));
const handle_error_1 = require("./handle-error");
function fetchFileFromGitHubAPI(apiUrl, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file info from GitHub API. HTTP Status: ${response.status}`);
            }
            const data = yield response.json();
            const fileContent = Buffer.from(data.content, 'base64').toString('utf-8');
            fs_extra_1.default.writeFileSync(outputPath, fileContent);
        }
        catch (err) {
            (0, handle_error_1.handleError)(`Error: ${err.message}`);
        }
    });
}
