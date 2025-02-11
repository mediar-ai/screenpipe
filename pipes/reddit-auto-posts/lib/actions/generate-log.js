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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = generateDailyLog;
const openai_1 = require("openai");
function generateDailyLog(screenData, dailylogPrompt, aiProviderType, gptModel, gptApiUrl, openaiApiKey, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const prompt = `${dailylogPrompt}

    Based on the following screen data, generate a concise daily log entry:

    ${JSON.stringify(screenData)}

    Return a JSON object with the following structure:
    {
        "activity": "Brief description of the activity",
        "category": "Category of the activity like work, email, slack, etc"
        "tags": ["productivity", "work", "email", "john", "salesforce", "etc"]
    }
        
    
    Rules:
    - Do not add backticks to the JSON eg \`\`\`json\`\`\` is WRONG
    - DO NOT RETURN ANYTHING BUT JSON. NO COMMENTS BELOW THE JSON.
        
    `;
        const openai = new openai_1.OpenAI({
            apiKey: aiProviderType === "screenpipe-cloud" ? userToken : openaiApiKey,
            baseURL: gptApiUrl,
            dangerouslyAllowBrowser: true,
        });
        const response = yield openai.chat.completions.create({
            model: gptModel,
            messages: [{ role: "user", content: prompt }],
        });
        console.log("gpt response for log:", response);
        if (!response.choices || response.choices.length === 0) {
            throw new Error("no choices returned from openai, please try again");
        }
        const messageContent = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!messageContent) {
            throw new Error("no content returned from openAI");
        }
        console.log("ai answer:", response);
        // clean up the result
        const cleanedResult = messageContent
            .trim()
            .replace(/^```(?:json)?\s*|\s*```$/g, "") // remove start and end code block markers
            .replace(/\n/g, "") // remove newlines
            .replace(/\\n/g, "") // remove escaped newlines
            .trim(); // trim any remaining whitespace
        let content;
        try {
            content = JSON.parse(cleanedResult);
            console.log("JSON content:", content);
        }
        catch (error) {
            console.warn("failed to parse ai response:", error);
            console.warn("cleaned result:", cleanedResult);
            throw new Error("invalid ai response format");
        }
        return content;
    });
}
