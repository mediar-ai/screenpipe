import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useAppWindowHistory } from "@/lib/hooks/use-sql-autocomplete";
import { Command } from "cmdk";

interface AppWindowAutocompleteProps {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type: "app" | "window";
  icon: React.ReactNode;
}

export function AppWindowAutocomplete({
  id,
  placeholder,
  value,
  onChange,
  type,
  icon,
}: AppWindowAutocompleteProps) {
  const { history, isLoading, error } = useAppWindowHistory(type);
  const [open, setOpen] = useState(false);

  if (error) {
    console.error("error fetching history:", error);
  }

  return (
    <div className="relative">
      {icon}
      <Command>
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="pl-8"
        />
        {open && !isLoading && (
          <Command.List className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-auto">
            <Command.Input />
            {history.map((item) => (
              <Command.Item
                key={item.name}
                value={item.name}
                onSelect={(selectedValue) => {
                  onChange(selectedValue);
                  setOpen(false);
                }}
              >
                {item.name} ({item.count})
              </Command.Item>
            ))}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
