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
exports.generateMeetingNotes = generateMeetingNotes;
const openai_1 = require("openai");
function extractFacts(transcript, title, openai, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const systemPrompt = `extract meeting facts if any`;
        console.log("extracting facts from meeting", { systemPrompt });
        const response = yield openai.chat.completions.create({
            model: settings.aiModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `meeting: ${title}\n\ntranscript:\n${transcript}`
                }
            ],
            temperature: 0.1, // very low for factual accuracy
            max_tokens: 500,
        });
        return ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.split('\n').filter(fact => fact.trim()).map(fact => fact.replace(/^[•-]\s*/, '').trim())) || [];
    });
}
function extractEvents(transcript, title, openai, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const systemPrompt = `extract events of the meeting if any`;
        console.log("extracting discussed events from meeting", { systemPrompt });
        const response = yield openai.chat.completions.create({
            model: settings.aiModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `meeting: ${title}\n\ntranscript:\n${transcript}`
                }
            ],
            temperature: 0.2,
            max_tokens: 500,
        });
        return ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.split('\n').filter(event => event.trim()).map(event => event.replace(/^[•-]\s*/, '').trim())) || [];
    });
}
function extractFlow(transcript, title, openai, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const systemPrompt = `in a few words what the meeting is`;
        console.log("extracting meeting flow", { systemPrompt });
        const response = yield openai.chat.completions.create({
            model: settings.aiModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `meeting: ${title}\n\ntranscript:\n${transcript}`
                }
            ],
            temperature: 0.3,
            max_tokens: 500,
        });
        return ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.split('\n').filter(flow => flow.trim()).map(flow => flow.replace(/^[•-]\s*/, '').trim())) || [];
    });
}
function extractDecisions(transcript, title, openai, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const systemPrompt = `extract decisions from transcript if any`;
        console.log("extracting decisions and next steps", { systemPrompt });
        const response = yield openai.chat.completions.create({
            model: settings.aiModel,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `meeting: ${title}\n\ntranscript:\n${transcript}`
                }
            ],
            temperature: 0.2,
            max_tokens: 500,
        });
        return ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.split('\n').filter(decision => decision.trim()).map(decision => decision.replace(/^[•-]\s*/, '').trim())) || [];
    });
}
function generateMeetingNotes(meeting, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const openai = new openai_1.OpenAI({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            console.log("analyzing meeting:", {
                meeting_id: meeting.id,
                meeting_name: meeting.humanName || meeting.aiName,
                segments_count: ((_a = meeting.segments) === null || _a === void 0 ? void 0 : _a.length) || 0,
                notes_count: ((_b = meeting.notes) === null || _b === void 0 ? void 0 : _b.length) || 0
            });
            // combine transcript with existing notes for context
            const transcript = (meeting.segments || [])
                .map(s => { var _a; return `[${(_a = s.speaker) !== null && _a !== void 0 ? _a : 'unknown'}]: ${s.transcription}`; })
                .join("\n");
            const existingNotes = (meeting.notes || [])
                .map(n => `[${n.timestamp.toString()}] ${n.text}`)
                .join("\n");
            const title = meeting.humanName || meeting.aiName || 'unknown';
            // modify system prompts to consider existing notes
            const systemPrompt = `you are me, a participant in this meeting. review the transcript and my existing notes.
                             synthesize everything into clear, actionable notes that i can refer to later.
                             focus on what's most relevant and important from my perspective.
                             write in a natural, first-person style and return as bullet points.`;
            // Run all extractions in parallel with enhanced context
            const [facts, events, flow, decisions] = yield Promise.all([
                extractFacts(`transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, title, openai, settings),
                extractEvents(`transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, title, openai, settings),
                extractFlow(`transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, title, openai, settings),
                extractDecisions(`transcript:\n${transcript}\n\nexisting notes:\n${existingNotes}`, title, openai, settings)
            ]);
            // Generate final combined notes with enhanced context
            console.log("generating final combined notes with manual notes context", { systemPrompt });
            const response = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `meeting: ${title}
                    
                    manual notes:
                    ${existingNotes}
                    
                    analyzed components:
                    facts:
                    ${facts.join('\n')}
                    
                    events:
                    ${events.join('\n')}
                    
                    flow:
                    ${flow.join('\n')}
                    
                    decisions:
                    ${decisions.join('\n')}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000,
            });
            const notes = ((_e = (_d = (_c = response.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) === null || _e === void 0 ? void 0 : _e.split('\n').filter(note => note.trim()).map(note => note.replace(/^[•-]\s*/, '').trim())) || [];
            console.log("completed meeting analysis:", {
                facts_count: facts.length,
                events_count: events.length,
                flow_count: flow.length,
                decisions_count: decisions.length,
                final_notes_count: notes.length
            });
            const summarySystemPrompt = `you are me, summarize these meeting notes in 3-4 key points that i should remember.
                                    and return as bullet points.`;
            console.log("generating concise summary", { summarySystemPrompt });
            const summaryResponse = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: [
                    {
                        role: "system",
                        content: summarySystemPrompt
                    },
                    {
                        role: "user",
                        content: `${notes.join('\n')}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 300,
            });
            const summary = ((_h = (_g = (_f = summaryResponse.choices[0]) === null || _f === void 0 ? void 0 : _f.message) === null || _g === void 0 ? void 0 : _g.content) === null || _h === void 0 ? void 0 : _h.split('\n').filter(note => note.trim()).map(note => note.replace(/^[•-]\s*/, '').trim())) || [];
            return {
                facts,
                events,
                flow,
                decisions,
                summary
            };
        }
        catch (error) {
            console.error("error analyzing meeting:", error);
            return {
                facts: [],
                events: [],
                flow: [],
                decisions: [],
                summary: []
            };
        }
    });
}
