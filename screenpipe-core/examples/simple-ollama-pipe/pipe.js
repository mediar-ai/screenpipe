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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const ai_1 = require("ai");
const ollama_ai_provider_1 = require("ollama-ai-provider");
const screenpipeQuery = zod_1.z.object({
    q: zod_1.z.string().optional(),
    content_type: zod_1.z.enum(["ocr", "audio", "all"]).default("all"),
    limit: zod_1.z.number().default(20),
    start_time: zod_1.z.string().default(new Date(Date.now() - 3600000).toISOString()),
    end_time: zod_1.z.string().default(new Date().toISOString()),
});
function queryScreenpipe(params) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const queryParams = new URLSearchParams(Object.entries(params).filter(([_, v]) => v != null));
            console.log("Calling screenpipe", JSON.stringify(params));
            const response = yield fetch(`http://localhost:3030/search?${queryParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error("Error querying screenpipe:", error);
            return null;
        }
    });
}
const simpleOllamaChat = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    console.log("Starting simple Ollama chat. Make sure to run `ollama run nemotron-mini:4b-instruct-q4_K_M` before running this script.");
    const provider = (0, ollama_ai_provider_1.ollama)("nemotron-mini:4b-instruct-q4_K_M");
    while (true) {
        try {
            // query last 1 min of screenpipe
            const screenpipe = yield queryScreenpipe({
                content_type: "all",
                limit: 10,
                start_time: new Date(Date.now() - 60000).toISOString(),
                end_time: new Date().toISOString(),
            });
            console.log("got some screenpipe data of length:", screenpipe.data.length);
            const conversation = [
                {
                    role: "user",
                    content: "What did I do in the last minute? Here is the screenpipe data: " +
                        JSON.stringify(screenpipe),
                },
            ];
            const { textStream } = yield (0, ai_1.streamText)({
                model: provider,
                messages: conversation,
                maxToolRoundtrips: 3,
            });
            process.stdout.write("ai: ");
            try {
                for (var _d = true, textStream_1 = (e_1 = void 0, __asyncValues(textStream)), textStream_1_1; textStream_1_1 = yield textStream_1.next(), _a = textStream_1_1.done, !_a; _d = true) {
                    _c = textStream_1_1.value;
                    _d = false;
                    const chunk = _c;
                    process.stdout.write(chunk);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = textStream_1.return)) yield _b.call(textStream_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            console.log(); // new line after the complete response
        }
        catch (error) {
            console.error("error in ollama chat:", error);
        }
    }
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    yield simpleOllamaChat();
});
main();
