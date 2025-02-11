"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextEditor = TextEditor;
const react_1 = require("react");
const use_settings_1 = require("@/lib/hooks/use-settings");
const storage_for_live_meeting_1 = require("./hooks/storage-for-live-meeting");
function TextEditor({ notes, setNotes, scrollRef, onScroll, isEditing = false, analysis }) {
    const [hoverX, setHoverX] = (0, react_1.useState)(null);
    const [hoveredNoteId, setHoveredNoteId] = (0, react_1.useState)(null);
    const { settings } = (0, use_settings_1.useSettings)();
    const { title, segments } = (0, storage_for_live_meeting_1.useMeetingContext)();
    // Add local state for text content
    const [localText, setLocalText] = (0, react_1.useState)('');
    const textDebounceRef = (0, react_1.useRef)();
    const initializedRef = (0, react_1.useRef)(false);
    // Initialize only once when component mounts
    (0, react_1.useEffect)(() => {
        // Initialize localText only when notes are available and the editor has not been initialized yet
        if (!initializedRef.current && notes.length > 0) {
            console.log('text-editor: initializing localText from updated notes', { notesCount: notes.length });
            const text = notes
                .map(note => {
                const text = note.text || '';
                // Use bullet point if the note text starts with "- "
                return text.startsWith('- ') ? '• ' + text.slice(2) : text;
            })
                .join('\n');
            setLocalText(text);
            initializedRef.current = true;
        }
    }, [notes]); // dependency updated to react on changes to `notes`
    const handleMouseMove = (e, noteId) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoverX(e.clientX - rect.left);
        setHoveredNoteId(noteId);
    };
    const handleMouseLeave = () => {
        setHoverX(null);
        setHoveredNoteId(null);
    };
    const handleKeyDown = (e) => {
        // Handle bold text (Ctrl/Cmd + B)
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            const textarea = e.currentTarget;
            const { selectionStart, selectionEnd } = textarea;
            const text = textarea.value;
            // If there's selected text, wrap it with bold syntax
            if (selectionStart !== selectionEnd) {
                const newText = text.slice(0, selectionStart) +
                    '**' + text.slice(selectionStart, selectionEnd) + '**' +
                    text.slice(selectionEnd);
                setLocalText(newText);
                const newNotes = newText.split('\n').map(createNote);
                setNotes(newNotes);
                // Maintain selection including the markdown syntax
                setTimeout(() => {
                    textarea.selectionStart = selectionStart + 2;
                    textarea.selectionEnd = selectionEnd + 2;
                }, 0);
                return;
            }
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const textarea = e.currentTarget;
            const { selectionStart } = textarea;
            const text = textarea.value;
            // Get the current line
            const lastNewLine = text.lastIndexOf('\n', selectionStart - 1);
            const currentLine = text.slice(lastNewLine + 1, selectionStart);
            // Check if current line starts with "• " or "- "
            const isList = currentLine.trimStart().startsWith('• ') || currentLine.trimStart().startsWith('- ');
            // If current line is empty and has bullet, remove the bullet
            if (currentLine.trim() === '•' || currentLine.trim() === '-') {
                const newText = text.slice(0, lastNewLine + 1) + text.slice(selectionStart);
                setLocalText(newText);
                return;
            }
            // Add new line with bullet if current line has bullet
            const insertion = isList ? '\n• ' : '\n';
            const newText = text.slice(0, selectionStart) + insertion + text.slice(selectionStart);
            setLocalText(newText);
            // Move cursor after the bullet
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length;
            }, 0);
        }
    };
    const createNote = (text) => ({
        id: crypto.randomUUID(),
        text: text.startsWith('• ') ? '- ' + text.slice(2) : text,
        timestamp: new Date(),
        isInput: true,
        device: 'keyboard',
        editedAt: undefined
    });
    return (<div ref={scrollRef} onScroll={onScroll} className="flex flex-col h-full">
      <textarea value={localText} onChange={(e) => {
            const newValue = e.target.value;
            setLocalText(newValue);
            if (textDebounceRef.current) {
                clearTimeout(textDebounceRef.current);
            }
            textDebounceRef.current = setTimeout(() => {
                var _a, _b;
                const newNotes = newValue.split('\n')
                    .filter(text => text.trim())
                    .map(createNote);
                console.log('creating new notes:', {
                    oldLength: notes.length,
                    newLength: newNotes.length,
                    sample: (_b = (_a = newNotes[0]) === null || _a === void 0 ? void 0 : _a.text) === null || _b === void 0 ? void 0 : _b.slice(0, 50)
                });
                setNotes(newNotes);
            }, 500);
        }} onBlur={() => {
            const currentNotes = notes.map(n => n.text).join('\n');
            if (localText.trim() !== currentNotes.trim()) {
                console.log('committing text on blur');
                const newNotes = localText.split('\n')
                    .filter(text => text.trim())
                    .map(createNote);
                setNotes(newNotes);
            }
        }} onKeyDown={handleKeyDown} className="flex-1 w-full p-3 resize-none focus:outline-none bg-transparent overflow-y-auto" placeholder="type your notes..." autoFocus={isEditing}/>
    </div>);
}
