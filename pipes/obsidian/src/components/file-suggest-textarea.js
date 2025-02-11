"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSuggestTextarea = FileSuggestTextarea;
const react_1 = require("react");
const cmdk_1 = require("cmdk");
const react_2 = __importDefault(require("react"));
function highlightMatch(text, search) {
    if (!search)
        return text;
    const index = text.toLowerCase().indexOf(search.toLowerCase());
    if (index === -1)
        return text;
    return (<>
      {text.slice(0, index)}
      <span className="bg-yellow-200 dark:bg-yellow-800">
        {text.slice(index, index + search.length)}
      </span>
      {text.slice(index + search.length)}
    </>);
}
function getDisplayName(fullPath) {
    const parts = fullPath.split("/");
    const file = parts.pop() || "";
    const dir = parts.join("/");
    return { dir, file };
}
function FileSuggestTextarea({ value, setValue, className = "", placeholder, disabled = false, }) {
    const [showSuggestions, setShowSuggestions] = (0, react_1.useState)(false);
    const [searchTerm, setSearchTerm] = (0, react_1.useState)("");
    const [cursorCoords, setCursorCoords] = (0, react_1.useState)({ x: 0, y: 0 });
    const [files, setFiles] = (0, react_1.useState)([]);
    const textareaRef = (0, react_1.useRef)(null);
    const searchTimeout = (0, react_1.useRef)(undefined);
    const cursorPosRef = (0, react_1.useRef)(null);
    // Optimized debounce with cleanup
    const debouncedFetch = (0, react_1.useCallback)((search) => {
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }
        if (search.length < 2) {
            setFiles([]);
            return;
        }
        searchTimeout.current = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch(`/api/files?search=${encodeURIComponent(search)}`);
                const data = yield res.json();
                setFiles(data.files);
            }
            catch (err) {
                console.error("failed to fetch files:", err);
                setFiles([]);
            }
        }), 150); // Reduced debounce time
    }, []);
    const getCursorCoordinates = () => {
        const textarea = textareaRef.current;
        if (!textarea)
            return;
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
    const handleTextareaChange = (e) => {
        if (disabled)
            return;
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
        }
        else {
            setShowSuggestions(false);
            setFiles([]);
        }
    };
    const handleSuggestionSelect = (file) => {
        if (!textareaRef.current)
            return;
        const cursorPos = textareaRef.current.selectionStart;
        const textBeforeCursor = value.slice(0, cursorPos);
        const textAfterCursor = value.slice(cursorPos);
        const lastAtPos = textBeforeCursor.lastIndexOf("@");
        const insertText = `@[[${file}]] `;
        const newValue = textBeforeCursor.slice(0, lastAtPos) + insertText + textAfterCursor;
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
    (0, react_1.useEffect)(() => {
        return () => {
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, []);
    // Remove the cursor position effect as it's causing the double typing
    (0, react_1.useEffect)(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [value]);
    return (<div className="relative">
      <textarea ref={textareaRef} value={value} onChange={handleTextareaChange} className={`w-full min-h-[100px] p-2 rounded-md border bg-background ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`} placeholder={placeholder} rows={10} disabled={disabled}/>

      {showSuggestions && !disabled && (<div className="fixed z-50 w-[400px] max-h-48 overflow-y-auto bg-background border rounded-md shadow-lg" style={{
                top: `${cursorCoords.y + 5}px`,
                left: `${cursorCoords.x}px`,
            }}>
          <cmdk_1.Command>
            <cmdk_1.Command.List>
              {files.map((file) => {
                const { dir, file: fileName } = getDisplayName(file);
                return (<cmdk_1.Command.Item key={file} onSelect={() => handleSuggestionSelect(file)} className="px-2 py-1 hover:bg-accent cursor-pointer flex flex-col gap-0.5">
                    <span className="text-sm text-blue-500 font-medium">
                      {highlightMatch(fileName, searchTerm)}
                    </span>
                    {dir && (<span className="text-xs text-muted-foreground opacity-60">
                        {dir}
                      </span>)}
                  </cmdk_1.Command.Item>);
            })}
              {files.length === 0 && (<div className="px-2 py-1 text-muted-foreground">
                  no matching files
                </div>)}
            </cmdk_1.Command.List>
          </cmdk_1.Command>
        </div>)}
    </div>);
}
