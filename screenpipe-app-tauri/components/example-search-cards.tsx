import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Mail, Clock } from "lucide-react";
import { Badge } from "./ui/badge";

export interface ExampleSearch {
  title: string;
  windowName?: string;
  appName?: string;
  limit: number;
  minLength: number;
  contentType: string;
  startDate: Date;
}

interface ExampleSearchCardsProps {
  onSelect: (example: ExampleSearch) => void;
}

const exampleSearches: ExampleSearch[] = [
  {
    title: "summarize last hour meeting",
    contentType: "audio",
    limit: 120,
    minLength: 10,
    startDate: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
  },
  {
    title: "summarize my mails",
    contentType: "ocr",
    windowName: "gmail",
    limit: 30,
    minLength: 50,
    startDate: new Date(new Date().setHours(0, 0, 0, 0)), // since midnight local time
  },
  {
    title: "time spent last hour",
    contentType: "ocr",
    limit: 25,
    minLength: 50,
    startDate: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
  },
];

export function ExampleSearchCards({ onSelect }: ExampleSearchCardsProps) {
  const getIcon = (title: string) => {
    switch (title) {
      case "summarize last hour meeting":
        return <Search className="mr-2 h-4 w-4" />;
      case "summarize by mail":
        return <Mail className="mr-2 h-4 w-4" />;
      case "time spent on apps last hour":
        return <Clock className="mr-2 h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
      {exampleSearches.map((example, index) => (
        <div key={index} className="relative group h-[150px]">
          <div className="absolute inset-0 rounded-lg transition-all duration-300 ease-out group-hover:before:opacity-100 group-hover:before:scale-100 before:absolute before:inset-0 before:rounded-lg before:border-2 before:border-black dark:before:border-white before:opacity-0 before:scale-95 group-hover:before:opacity-100 group-hover:before:scale-100 before:transition-all before:duration-300 before:ease-out" />
          <Card
            className="cursor-pointer relative bg-white dark:bg-gray-800 z-10 h-full transition-transform duration-300 ease-out group-hover:scale-[0.98]"
            onClick={() => onSelect(example)}
          >
            <CardContent className="p-3 flex flex-col h-full">
              <div className="flex items-center mb-1">
                {getIcon(example.title)}
                <h3 className="text-sm font-semibold">{example.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {example.contentType && <Badge>{example.contentType}</Badge>}
                {example.windowName && (
                  <Badge>window: {example.windowName}</Badge>
                )}
                {example.appName && <Badge>app: {example.appName}</Badge>}
                {example.limit && <Badge>limit: {example.limit}</Badge>}
                {example.minLength && (
                  <Badge>min: {example.minLength}</Badge>
                )}
                {example.startDate && (
                  <Badge>start: {example.startDate.toLocaleString()}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
