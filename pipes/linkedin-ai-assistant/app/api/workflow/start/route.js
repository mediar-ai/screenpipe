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
exports.POST = POST;
const server_1 = require("next/server");
const intro_requester_1 = require("@/lib/logic-sequence/intro-requester");
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { mode } = yield request.json();
            const maxProfiles = mode === 'test' ? 1 : Infinity; // full run will process all profiles
            // start the automation in the background
            (0, intro_requester_1.startAutomation)(maxProfiles).catch(error => {
                console.error('automation failed:', error);
            });
            return server_1.NextResponse.json({ status: 'started', mode });
        }
        catch (error) {
            console.error('failed to start workflow:', error);
            return server_1.NextResponse.json({ error: 'failed to start workflow' }, { status: 500 });
        }
    });
}
