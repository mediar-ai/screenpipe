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
exports.POST = POST;
const state_1 = require("./state");
const isRunning = false;
function GET() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Response(JSON.stringify({
            isRunning,
            steps: state_1.currentSteps,
            queueStats: state_1.queueStats
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
}
function POST(request) {
    return __awaiter(this, void 0, void 0, function* () {
        const { state } = yield request.json();
        (0, state_1.setRunningState)(state);
        return new Response(JSON.stringify({ success: true }));
    });
}
