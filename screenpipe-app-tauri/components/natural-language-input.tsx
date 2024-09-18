import React, { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const useCases = [
  { id: 1, text: "summarize my last meeting" },
  { id: 2, text: "find that chart i saw yesterday" },
  { id: 3, text: "what did i work on this week?" },
  { id: 4, text: "generate a report of today's activities" },
  { id: 5, text: "remind me what john said about the project" },
  { id: 6, text: "find the website i visited about machine learning" },
];

interface NaturalLanguageInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
}

export function NaturalLanguageInput({
  onSubmit,
  isLoading,
}: NaturalLanguageInputProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(query);
  };

  const handleUseCaseClick = (text: string) => {
    setQuery(text);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {useCases.map((useCase) => (
          <motion.div
            key={useCase.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Card
              className="cursor-pointer h-full"
              onClick={() => handleUseCaseClick(useCase.text)}
            >
              <CardContent className="flex items-center justify-center h-full p-4">
                <p className="text-center text-sm">{useCase.text}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="e.g., find all zoom meetings from last week where we discussed the new product launch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full"
        />
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              asking...
            </>
          ) : (
            "ask"
          )}
        </Button>
      </form>
    </div>
  );
}
