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
const ai_1 = require("ai");
const ollama_ai_provider_1 = require("ollama-ai-provider");
const js_1 = require("@screenpipe/js");
const simpleOllamaChat = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    console.log("starting simple ollama chat. make sure to run `ollama run nemotron-mini:4b-instruct-q4_k_m` before running this script.");
    const provider = (0, ollama_ai_provider_1.ollama)("nemotron-mini:4b-instruct-q4_k_m");
    while (true) {
        try {
            // query last 1 min of screenpipe
            const screenpipe = yield (0, js_1.queryScreenpipe)({
                content_type: "all",
                limit: 10,
                start_time: new Date(Date.now() - 60000).toISOString(),
                end_time: new Date().toISOString(),
            });
            console.log("got some screenpipe data of length:", screenpipe.data.length);
            const conversation = [
                {
                    role: "user",
                    content: "what did i do in the last minute? here is the screenpipe data: " +
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
