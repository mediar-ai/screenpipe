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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const setup_1 = require("@/lib/notion/setup");
const js_1 = require("@screenpipe/js");
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield js_1.pipe.settings.getNamespaceSettings("notion");
            const credentials = yield (0, setup_1.automateNotionSetup)(settings === null || settings === void 0 ? void 0 : settings.workspace);
            return server_1.NextResponse.json(credentials);
        }
        catch (error) {
            console.log(error);
            return server_1.NextResponse.json({ error: "Failed to setup Notion" }, { status: 500 });
        }
    });
}
