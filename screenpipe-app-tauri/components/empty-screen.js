"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmptyScreen = EmptyScreen;
const react_1 = __importDefault(require("react"));
const card_1 = require("@/components/ui/card");
const suggestions = [
    "Summarize last 15 mins audio conversation with action items",
    "Write instructions to reproduce my engineering work from last 15 mins",
    "Look at my data from last 15 mins and tell me how i can become a better programmer",
    "Create a table of everything I did in the last 15 mins",
    "Create a bullet list of everything I did in the last 15 mins with timestamps and path to the video",
    "Show me a video of what i was doing at 8.11 am (take file_path and put it in an inline code block)",
];
function EmptyScreen({ onSuggestionClick }) {
    return (<div className="flex flex-col items-center justify-center h-full space-y-4">
      <h3 className="text-lg font-semibold">Get started with Screenpipe</h3>
      <p className="text-sm text-gray-500">
        Click on a suggestion or type your own query
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {suggestions.map((suggestion, index) => (<card_1.Card key={index} className="cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSuggestionClick(suggestion)}>
            <card_1.CardContent className="p-4">
              <p className="text-sm">{suggestion}</p>
            </card_1.CardContent>
          </card_1.Card>))}
      </div>
    </div>);
}
