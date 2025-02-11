"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarySection = SummarySection;
const react_1 = require("react");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const lucide_react_1 = require("lucide-react");
const react_markdown_1 = __importDefault(require("react-markdown"));
function SummarySection({ meeting, onCopy, onGenerateSummary, isSummarizing }) {
    const [customPrompt, setCustomPrompt] = (0, react_1.useState)("please provide a concise summary of the following meeting transcript");
    return (<div className="relative">
      <h4 className="font-semibold mb-2">summary:</h4>
      {meeting.aiSummary && (<button_1.Button onClick={() => onCopy(meeting.aiSummary || "")} className="absolute top-0 right-0 p-1 h-6 w-6" variant="outline" size="icon">
          <lucide_react_1.Copy className="h-4 w-4"/>
        </button_1.Button>)}
      {meeting.aiSummary ? (<react_markdown_1.default className="prose max-w-none">
          {meeting.aiSummary}
        </react_markdown_1.default>) : (<div className="flex items-center mt-2">
          <input_1.Input type="text" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="custom summary prompt (optional)" className="mr-2 p-2 border rounded text-sm flex-grow"/>
          <button_1.Button onClick={() => onGenerateSummary(meeting, customPrompt)} disabled={isSummarizing}>
            {isSummarizing ? (<lucide_react_1.FileText className="h-4 w-4 mr-2 animate-pulse"/>) : (<lucide_react_1.PlusCircle className="h-4 w-4 mr-2"/>)}
            {isSummarizing ? "generating summary..." : "generate summary"}
          </button_1.Button>
        </div>)}
    </div>);
}
