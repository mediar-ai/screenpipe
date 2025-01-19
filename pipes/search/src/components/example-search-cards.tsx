import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Mail, Clock, AlertCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { useSettings } from "@/lib/hooks/use-settings";

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

export function ExampleSearchCards({ onSelect }: ExampleSearchCardsProps) {
  const [exampleSearches, setExampleSearches] = useState<ExampleSearch[]>([]);
  const { health } = useHealthCheck();
  const { settings } = useSettings();

  useEffect(() => {
    setExampleSearches([
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
        limit: 25,
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
    ]);
  }, []);

  const getIcon = (title: string) => {
    switch (title) {
      case "summarize last hour meeting":
        return <Search className="mr-2 h-4 w-4" />;
      case "summarize my mails":
        return <Mail className="mr-2 h-4 w-4" />;
      case "time spent last hour":
        return <Clock className="mr-2 h-4 w-4" />;
      default:
        return <Search className="mr-2 h-4 w-4" />; // default icon
    }
  };

  const isHealthError = !health || health?.status === "error";
  const isAiDisabled =
    !settings.user?.token && settings.aiProviderType === "screenpipe-cloud";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
      {exampleSearches.map((example, index) => (
        <TooltipProvider key={index}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative group h-[150px] ${
                  (isHealthError || isAiDisabled) ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <div className="absolute inset-0 rounded-lg transition-all duration-300 ease-out group-hover:before:opacity-100 group-hover:before:scale-100 before:absolute before:inset-0 before:rounded-lg before:border-2 before:border-black dark:before:border-white before:opacity-0 before:scale-95 group-hover:before:opacity-100 group-hover:before:scale-100 before:transition-all before:duration-300 before:ease-out" />
                <Card
                  className={`cursor-pointer relative bg-white dark:bg-gray-800 z-10 h-full transition-transform duration-300 ease-out ${
                    isHealthError ? "" : "group-hover:scale-[0.98]"
                  }`}
                  onClick={() => !isHealthError && onSelect(example)}
                >
                  <CardContent className="p-3 flex flex-col h-full">
                    <div className="flex items-center mb-1">
                      {getIcon(example.title)}
                      <h3 className="text-sm font-semibold">{example.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {example.contentType && (
                        <Badge>{example.contentType}</Badge>
                      )}
                      {example.windowName && (
                        <Badge>window: {example.windowName}</Badge>
                      )}
                      {example.appName && <Badge>app: {example.appName}</Badge>}
                      {example.limit && <Badge>limit: {example.limit}</Badge>}
                      {example.minLength && (
                        <Badge>min: {example.minLength}</Badge>
                      )}
                      {example.startDate && (
                        <Badge>
                          start: {example.startDate.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TooltipTrigger>
            {(isHealthError || isAiDisabled) && (
              <TooltipContent>
                <p>
                  {(isAiDisabled && isHealthError) ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      you don't have access to screenpipe-cloud, <br /> and screenpipe backend is not running!
                    </>
                  ) : isHealthError ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      screenpipe is not running. examples are disabled!
                    </>
                  ) : isAiDisabled ? (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4 text-red-500 inline" />
                      you don't have access to screenpipe-cloud :( <br/> please consider login!
                    </>
                  ) : (
                    ""
                  )}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}
