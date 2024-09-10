import React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyScreenProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Summarize last hour audio conversation with action items",
  "Read my data from last 60 mins and list apps i spent the most time on, with duration, list of topics, etc. (be creative), as a table",
  "Look at my data from last hour and tell me how i can become a better programmer",
  "Create a table of everything I did in the last hour",
  "Create a bullet list of everything I did in the last hour with timestamps and path to the video",
  "Show me a video of what i was doing at 8.11 am (take file_path and put it in an inline code block)",
];

export function EmptyScreen({ onSuggestionClick }: EmptyScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <h3 className="text-lg font-semibold">Get started with Screenpipe</h3>
      <p className="text-sm text-gray-500">
        Click on a suggestion or type your own query
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {suggestions.map((suggestion, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => onSuggestionClick(suggestion)}
          >
            <CardContent className="p-4">
              <p className="text-sm">{suggestion}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
