"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import React from "react";

interface FileSuggestTextareaProps {
  value: string;
  setValue: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

function highlightMatch(text: string, search: string) {
  if (!search) return text;
  const index = text.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="bg-yellow-200 dark:bg-yellow-800">
        {text.slice(index, index + search.length)}
      </span>
      {text.slice(index + search.length)}
    </>
  );
}

interface NotionPage {
  id: number;
  title: string;
}

export function FileSuggestTextarea({
  value,
  setValue,
  className = "",
  placeholder,
  disabled = false,
}: FileSuggestTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [files, setFiles] = useState<NotionPage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const cursorPosRef = useRef<number | null>(null);

  // Optimized debounce with cleanup
  const debouncedFetch = useCallback((search: string) => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (search.length < 2) {
      setFiles([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/notion/pages?q=${encodeURIComponent(search)}`,
        );
        const data = await res.json();
        setFiles(data.pages ?? []);
      } catch (err) {
        console.error("failed to fetch files:", err);
        setFiles([]);
      }
    }, 150); // Reduced debounce time
  }, []);

  const getCursorCoordinates = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, value } = textarea;
    const textBeforeCursor = value.slice(0, selectionStart);

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.width = getComputedStyle(textarea).width;
    div.style.font = getComputedStyle(textarea).font;
    div.style.padding = getComputedStyle(textarea).padding;
    div.style.border = getComputedStyle(textarea).border;

    div.innerHTML = textBeforeCursor.replace(/\n/g, "<br>");
    document.body.appendChild(div);

    const rect = textarea.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    const scrollTop = textarea.scrollTop;

    document.body.removeChild(div);

    return {
      x: rect.left + (divRect.width % rect.width),
      y: rect.top + divRect.height - scrollTop,
    };
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Update value first
    setValue(newValue);

    const textBeforeCursor = newValue.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([^@\n\[\](){}<>]*?)$/);

    if (match) {
      const newSearchTerm = match[1].trim();
      setSearchTerm(newSearchTerm);
      setShowSuggestions(true);
      const coords = getCursorCoordinates();
      if (coords) {
        setCursorCoords(coords);
      }
      debouncedFetch(newSearchTerm);
    } else {
      setShowSuggestions(false);
      setFiles([]);
    }
  };

  const handleSuggestionSelect = (file: NotionPage) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");

    const insertText = `@[[${file.id}]] `;
    const newValue =
      textBeforeCursor.slice(0, lastAtPos) + insertText + textAfterCursor;

    // Calculate new cursor position after the inserted text
    const newCursorPos = lastAtPos + insertText.length;
    cursorPosRef.current = newCursorPos;

    setValue(newValue);
    setShowSuggestions(false);

    // Ensure focus remains on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, []);

  // Remove the cursor position effect as it's causing the double typing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [value]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        className={`w-full min-h-[100px] p-2 rounded-md border bg-background ${disabled ? "opacity-50 cursor-not-allowed" : ""
          } ${className}`}
        placeholder={placeholder}
        rows={10}
        disabled={disabled}
      />

      {showSuggestions && !disabled && (
        <div
          className="fixed z-50 w-[400px] max-h-48 overflow-y-auto bg-background border rounded-md shadow-lg"
          style={{
            top: `${cursorCoords.y + 5}px`,
            left: `${cursorCoords.x}px`,
          }}
        >
          <Command>
            <Command.List>
              {files.map((file) => {
                return (
                  <Command.Item
                    key={file.id}
                    onSelect={() => handleSuggestionSelect(file)}
                    className="px-2 py-1 hover:bg-accent cursor-pointer flex flex-col gap-0.5"
                  >
                    <span className="text-sm text-blue-500 font-medium">
                      {highlightMatch(file.title, searchTerm)}
                    </span>
                  </Command.Item>
                );
              })}
              {files.length === 0 && (
                <div className="px-2 py-1 text-muted-foreground">
                  no matching files
                </div>
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
