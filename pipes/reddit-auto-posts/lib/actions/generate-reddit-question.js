"use strict";
"use server";
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
exports.default = generateRedditQuestions;
const openai_1 = require("openai");
const generate_reddit_links_1 = __importDefault(require("./generate-reddit-links"));
function generateRedditQuestions(screenData, customPrompt, aiProviderType, gptModel, gptApiUrl, openaiApiKey, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `${customPrompt}

  based on the following screen data, generate a list of questions i can ask the reddit community:

  ${JSON.stringify(screenData)}

  rules:
  - be specific and concise
  - return a list of posts, one level bullet list
  - keep the tone casual like you are chatting to friends
  - you can mention some context from the screen data 30% of the time, but don't mention very personal data
  - the list should be enumerated with square brackets like [1], [2], ...
  - each post starts with [TITLE] ... [/TITLE], then [BODY] ... [/BODY],
  - at the end of each post add a list of subreddits to post it in enumerated as [r/...], [r/....], [r/....], ...
  - at the end of each subreddit add "[SEND]"
  `;
        console.log("reddit questions prompt:", prompt);
        const openai = new openai_1.OpenAI({
            apiKey: aiProviderType === "screenpipe-cloud"
                ? userToken
                : openaiApiKey,
            baseURL: gptApiUrl,
            dangerouslyAllowBrowser: true,
        });
        const response = yield openai.chat.completions.create({
            model: gptModel,
            messages: [{ role: "user", content: prompt }],
        });
        console.log("reddit questions gpt response:", response);
        if (!response.choices || response.choices.length === 0) {
            throw new Error("no choices returned from openai");
        }
        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error("no content response got from ai, please try again");
        }
        return (0, generate_reddit_links_1.default)(content);
    });
}
