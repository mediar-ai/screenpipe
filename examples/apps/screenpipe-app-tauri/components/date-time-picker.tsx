import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "./ui/input";

export function DateTimePicker({
  date,
  setDate,
}: {
  date: Date;
  setDate: (date: Date) => void;
}) {
  const [selectedDateTime, setSelectedDateTime] = React.useState<Date>(date);

  React.useEffect(() => {
    setSelectedDateTime(date);
  }, [date]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDateTime = new Date(selectedDateTime);
      newDateTime.setFullYear(selectedDate.getFullYear());
      newDateTime.setMonth(selectedDate.getMonth());
      newDateTime.setDate(selectedDate.getDate());
      setSelectedDateTime(newDateTime);
      setDate(newDateTime);
    }
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = event.target.value.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDateTime = new Date(selectedDateTime);
      newDateTime.setHours(hours);
      newDateTime.setMinutes(minutes);
      setSelectedDateTime(newDateTime);
      setDate(newDateTime);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn("w-full justify-start text-left font-normal")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(date, "PPP HH:mm")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDateTime}
          onSelect={handleDateSelect}
          initialFocus
        />
        <div className="p-3 border-t border-border">
          <Input
            type="time"
            onChange={handleTimeChange}
            value={format(selectedDateTime, "HH:mm")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
