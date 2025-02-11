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
const check_messages_1 = require("@/lib/logic-sequence/check-messages");
const server_1 = require("next/server");
function POST() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield (0, check_messages_1.startMessageCheck)();
            return server_1.NextResponse.json(result);
        }
        catch (error) {
            return server_1.NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
    });
}
