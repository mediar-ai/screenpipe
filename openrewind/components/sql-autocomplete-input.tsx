import React, { useState, useRef, useCallback, useEffect } from "react";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { Command } from "cmdk";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SqlAutocompleteInputProps {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type: "app" | "window";
  icon?: React.ReactNode;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SqlAutocompleteInput({
  id,
  placeholder,
  value,
  onChange,
  type,
  icon,
  className,
  onKeyDown,
}: SqlAutocompleteInputProps) {
  const { items, isLoading } = useSqlAutocomplete(type);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  // update local state when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setInputValue(selectedValue);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onChange(newValue);
    },
    [onChange]
  );

  const handleClearInput = useCallback(() => {
    setInputValue("");
    onChange("");
    inputRef.current?.focus();
  }, [onChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        commandRef.current &&
        !commandRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className={cn("relative", className)} ref={commandRef}>
      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 z-10 flex items-center">
        {icon}
        <span className="w-2" />
      </div>
      <Command className="relative w-full" shouldFilter={false}>
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            className={cn("pr-8 w-full", icon ? "pl-7" : "pl-3")}
            autoCorrect="off"
            aria-autocomplete="none"
            onKeyDown={onKeyDown}
          />
          {inputValue && (
            <button
              onClick={handleClearInput}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {open && (
          <Command.List className="absolute z-20 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-auto shadow-lg text-sm">
            <div className="flex items-center px-3 py-2 border-b border-gray-200">
              <Search className="mr-2 h-4 w-4 text-gray-400" />
              <Command.Input
                placeholder="search..."
                value={inputValue}
                onValueChange={setInputValue}
                className="border-none focus:ring-0 outline-none w-full"
              />
            </div>
            {isLoading ? (
              <Command.Loading>
                <div className="px-4 py-2 text-gray-500 flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  loading...
                </div>
              </Command.Loading>
            ) : (
              items
                .filter((item) =>
                  item.name.toLowerCase().includes(inputValue.toLowerCase())
                )
                .map((item: any) => (
                  <Command.Item
                    key={item.name}
                    value={item.name}
                    onSelect={handleSelect}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                  >
                    {item.name} ({item.count})
                  </Command.Item>
                ))
            )}
            {!isLoading && items.length === 0 && (
              <div className="px-4 py-2 text-gray-500">no results found</div>
            )}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
