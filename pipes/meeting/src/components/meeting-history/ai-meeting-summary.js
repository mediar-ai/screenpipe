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
exports.generateMeetingSummary = generateMeetingSummary;
exports.generateMeetingSummaries = generateMeetingSummaries;
const ai_meeting_title_1 = require("./ai-meeting-title");
function generateMeetingSummary(meeting, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const openai = (0, ai_meeting_title_1.createAiClient)({ settings });
        try {
            console.log("generating ai summary for meeting:", {
                id: meeting.id,
                segments_count: meeting.segments.length,
                notes_count: meeting.notes.length,
                total_transcript_length: meeting.segments.reduce((acc, s) => acc + s.transcription.length, 0),
                total_notes_length: meeting.notes.reduce((acc, n) => acc + n.text.length, 0)
            });
            // Create prompt from meeting data
            const transcriptContent = meeting.segments
                .map((s) => `[${s.speaker}]: ${s.transcription}`)
                .join("\n");
            // Add notes context if available
            const notesContext = meeting.notes.length > 0
                ? `\nMeeting notes:\n${meeting.notes.join("\n")}`
                : "";
            const currentSummary = meeting.aiSummary;
            const summaryContext = currentSummary
                ? `\nCurrent summary: "${currentSummary}"\nPlease generate a new summary that might be more accurate.`
                : "";
            const currentTitle = meeting.humanName || meeting.aiName;
            const titleContext = currentTitle
                ? `\nMeeting title: "${currentTitle}"`
                : "";
            // First AI call for detailed analysis
            const analysisMessages = [
                {
                    role: "system",
                    content: "you are a meeting participant. analyze our discussion to understand: who was there, what we talked about, what we decided, and what our next steps are. be specific but concise.",
                },
                {
                    role: "user",
                    content: `please analyze our meeting:${titleContext}\n\n${transcriptContent}${notesContext}`,
                },
            ];
            console.log("sending request to openai for meeting analysis");
            const analysisResponse = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: analysisMessages,
                temperature: 0.7,
                max_tokens: 500,
            });
            const analysis = ((_c = (_b = (_a = analysisResponse.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || "";
            console.log("generated meeting analysis:", analysis.slice(0, 100) + "...");
            // Second AI call for final concise summary using the analysis
            const messages = [
                {
                    role: "system",
                    content: "you are a meeting participant writing a quick summary (max 100 words) of what we just discussed. focus on our key decisions and next steps. use bullet points for clarity. write in first person plural (we/our). do not use markdown formatting.",
                },
                {
                    role: "user",
                    content: `write a quick summary of our meeting (max 100 words). what did we discuss and decide? what are our next steps? do not use markdown formatting:
meeting title: ${titleContext}
${summaryContext}
our discussion details: ${analysis}

transcript:
${transcriptContent}
${notesContext}`,
                },
            ];
            console.log("sending request to openai for final meeting summary", {
                current_title: currentTitle,
                current_summary: currentSummary ? currentSummary.slice(0, 100) + "..." : null,
                analysis_sample: analysis.slice(0, 100) + "..."
            });
            const response = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages,
                temperature: 0.7,
                max_tokens: 200, // Reduced for more concise summaries
            });
            const aiSummary = (((_f = (_e = (_d = response.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.trim()) || "no summary available")
                .replace(/\*\*/g, '') // Remove any markdown bold
                .replace(/^#+\s*/gm, '') // Remove markdown headers
                .replace(/^\s*[-*]\s*/gm, '• ') // Standardize bullet points
                .trim();
            console.log("generated ai summary:", aiSummary.slice(0, 100) + "...");
            // Final AI call to condense the summary
            const condensedMessages = [
                {
                    role: "system",
                    content: "you are a meeting participant writing a very brief summary (50 words) of what we just discussed. focus on our main points and next actions. use bullet points. write in first person plural (we/our). do not use markdown formatting.",
                },
                {
                    role: "user",
                    content: `give me the key points from our meeting in 50 words or less:

${aiSummary}`,
                },
            ];
            console.log("sending request to openai for condensed summary");
            const condensedResponse = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: condensedMessages,
                temperature: 0.7,
                max_tokens: 100,
            });
            const condensedSummary = (((_j = (_h = (_g = condensedResponse.choices[0]) === null || _g === void 0 ? void 0 : _g.message) === null || _h === void 0 ? void 0 : _h.content) === null || _j === void 0 ? void 0 : _j.trim()) || aiSummary)
                .replace(/\*\*/g, '')
                .replace(/^#+\s*/gm, '')
                .replace(/^\s*[-*]\s*/gm, '• ')
                .trim();
            console.log("generated condensed summary:", condensedSummary.slice(0, 100) + "...");
            return condensedSummary;
        }
        catch (error) {
            console.error("error generating meeting summary:", error);
            return "failed to generate summary";
        }
    });
}
// Helper function to generate summaries for multiple meetings
function generateMeetingSummaries(meetings, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        // Process meetings in parallel with a concurrency limit
        const concurrencyLimit = 2; // Reduced from 3 due to larger content
        const chunks = [];
        for (let i = 0; i < meetings.length; i += concurrencyLimit) {
            chunks.push(meetings.slice(i, i + concurrencyLimit));
        }
        for (const chunk of chunks) {
            const promises = chunk.map((meeting) => __awaiter(this, void 0, void 0, function* () {
                const summary = yield generateMeetingSummary(meeting, settings);
                results[meeting.id] = summary;
            }));
            yield Promise.all(promises);
        }
        return results;
    });
}
