import React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyScreenProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Turn my recent conversations with my customers about my product into a table. Use 5 queries. Use 6 hours from now.",
  "Show me my recent Slack conversations with john about dog food. Only use screen text",
  "Read my coding stuff (python) and tell me how i can write better python code",
  "Summarize my recent email activity, only use screen text",
  "Turn my audio conversations with Lisa into a table, do use 2-3 queries"
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
