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
exports.POST = POST;
const server_1 = require("next/server");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const template = yield request.json();
            // Save to templates.json
            const templatePath = path_1.default.join(process.cwd(), 'lib', 'storage', 'templates.json');
            yield promises_1.default.writeFile(templatePath, JSON.stringify(template, null, 2));
            console.log('template saved successfully');
            return server_1.NextResponse.json({ success: true });
        }
        catch (error) {
            console.error('failed to save template:', error);
            return server_1.NextResponse.json({ error: String(error) }, { status: 500 });
        }
    });
}
