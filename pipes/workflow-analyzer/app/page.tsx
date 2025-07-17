"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Calendar as CalendarIcon,
  ChevronFirst,
  ChevronLast,
} from "lucide-react";
import { cn } from "@/lib/utils";


type AnalysisResult = {
  timestamp: string;
  content: string;
  type: "ocr" | "audio" | "app";
  appName?: string;
  windowName?: string;
};

export default function Home() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("09:00 AM");
  const [endTime, setEndTime] = useState("09:00 PM");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i % 12 === 0 ? 12 : i % 12;
    const ampm = i < 12 ? "AM" : "PM";
    return [
      `${hour.toString().padStart(2, "0")}:00 ${ampm}`,
      `${hour.toString().padStart(2, "0")}:30 ${ampm}`,
    ];
  }).flat();

  useEffect(() => {
    const handleFetchTimeline = async () => {
      if (!date) return;
      setIsLoading(true);
      setError(null);

      // Convert AM/PM time to 24-hour for Date object
      const convertTo24Hour = (timeStr: string) => {
        const [time, ampm] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);
        if (ampm === "PM" && hours !== 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        return { hours, minutes };
      };

      const { hours: startHour, minutes: startMinute } =
        convertTo24Hour(startTime);
      const { hours: endHour, minutes: endMinute } = convertTo24Hour(endTime);

      const startDate = new Date(date);
      startDate.setHours(startHour, startMinute, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(endHour, endMinute, 0, 0);

      try {
        const response = await fetch("/api/fetch-timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "failed to fetch timeline data");
        }

        const data = await response.json();
        setResults(data.data);
      } catch (err: any) {
        setError(err.message);
        console.error("error fetching timeline data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    handleFetchTimeline();
  }, [date, startTime, endTime]);

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = results.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(results.length / itemsPerPage);

  const handleAnalyzeWorkflow = async () => {
    setIsAnalyzing(true);
    // Placeholder logic
    try {
      await fetch("/api/analyze", {
        method: "POST",
      });
      // In the future, you might want to handle the response
    } catch (err) {
      console.error("error calling analyze-workflow:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case "ocr":
        return "secondary";
      case "audio":
        return "destructive";
      case "app":
        return "outline";
      default:
        return "default";
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-6xl">
        <header className="flex flex-col items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold">
            workflow analyzer
          </h1>
          <div className="flex items-center gap-2">
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[250px] justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(selectedDate) => {
                    setDate(selectedDate);
                    setIsCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="start time" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((time) => (
                  <SelectItem key={`start-${time}`} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="end time" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((time) => (
                  <SelectItem key={`end-${time}`} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              daily activity timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-full bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
            {error && <p className="text-red-500">error: {error}</p>}
            {!isLoading && !error && results.length === 0 && (
              <p>no activity found for the selected time range.</p>
            )}
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-4 pr-4">
                {currentItems.map((result, index) => (
                  <div key={index} className="flex items-start gap-4 text-sm">
                    <div className="w-24 shrink-0">
                      {format(new Date(result.timestamp), "hh:mm:ss a")}
                    </div>
                    <Badge
                      variant={getBadgeVariant(result.type)}
                      className="w-16 justify-center shrink-0"
                    >
                      {result.type}
                    </Badge>
                    <div className="flex-grow min-w-0">
                      <div className="max-h-20 overflow-hidden">
                        <p className="break-words">{result.content}</p>
                      </div>
                      {(result.appName || result.windowName) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {result.appName}
                          {result.appName && result.windowName && " - "}
                          {result.windowName}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <Button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="icon"
                >
                  <ChevronFirst className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                >
                  previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  page {currentPage} of {totalPages}
                </span>
                <Button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  variant="outline"
                >
                  next
                </Button>
                <Button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="icon"
                >
                  <ChevronLast className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {results.length > 0 && !isLoading && (
          <div className="mt-4 flex w-full justify-start">
            <Button onClick={handleAnalyzeWorkflow} disabled={isAnalyzing}>
              {isAnalyzing ? "analyzing..." : "analyze workflow"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
