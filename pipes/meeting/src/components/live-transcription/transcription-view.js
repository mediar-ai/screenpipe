"use strict";
'use client';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionView = TranscriptionView;
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("@/components/ui/dialog");
const react_1 = require("react");
const floating_container_buttons_1 = require("./floating-container-buttons");
const input_1 = require("@/components/ui/input");
const button_1 = require("@/components/ui/button");
const dialog_2 = require("@/components/ui/dialog");
const storage_vocabulary_1 = require("./hooks/storage-vocabulary");
const ai_create_note_based_on_chunk_1 = require("./hooks/ai-create-note-based-on-chunk");
const ai_improve_chunk_transcription_1 = require("./hooks/ai-improve-chunk-transcription");
const storage_for_live_meeting_1 = require("./hooks/storage-for-live-meeting");
const utils_1 = require("@/lib/utils");
const storage_for_live_meeting_2 = require("./hooks/storage-for-live-meeting");
const pull_meetings_from_screenpipe_1 = require("./hooks/pull-meetings-from-screenpipe");
function TranscriptionView({ chunks, isLoading, scrollRef, onScroll, isAutoScrollEnabled, isScrolledToBottom, settings }) {
    const { title, notes, setNotes, data, updateStore } = (0, storage_for_live_meeting_1.useMeetingContext)();
    const [viewMode, setViewMode] = (0, react_1.useState)('overlay');
    const [useOverlay, setUseOverlay] = (0, react_1.useState)(false);
    const [mergeModalOpen, setMergeModalOpen] = (0, react_1.useState)(false);
    const [nameModalOpen, setNameModalOpen] = (0, react_1.useState)(false);
    const [selectedSpeaker, setSelectedSpeaker] = (0, react_1.useState)(null);
    const [targetSpeaker, setTargetSpeaker] = (0, react_1.useState)(null);
    const [customSpeaker, setCustomSpeaker] = (0, react_1.useState)('');
    const [speakerMappings, setSpeakerMappings] = (0, react_1.useState)({});
    const [editedChunks, setEditedChunks] = (0, react_1.useState)({});
    const [selectedText, setSelectedText] = (0, react_1.useState)('');
    const [selectionPosition, setSelectionPosition] = (0, react_1.useState)(null);
    const [vocabDialogOpen, setVocabDialogOpen] = (0, react_1.useState)(false);
    const [vocabEntry, setVocabEntry] = (0, react_1.useState)('');
    const [notification, setNotification] = (0, react_1.useState)(null);
    const [improvingChunks, setImprovingChunks] = (0, react_1.useState)({});
    const [recentlyImproved, setRecentlyImproved] = (0, react_1.useState)({});
    const lastProcessedChunkRef = (0, react_1.useRef)(-1);
    const [showLoadButton, setShowLoadButton] = (0, react_1.useState)(false);
    const [loadingHistory, setLoadingHistory] = (0, react_1.useState)(false);
    const { fetchRecentChunks } = (0, pull_meetings_from_screenpipe_1.useRecentChunks)();
    // Add logging for component mount/unmount
    (0, react_1.useEffect)(() => {
        console.log('transcription view mounted', {
            chunksCount: chunks.length,
            isLoading,
            hasTitle: !!title,
            hasNotes: notes.length > 0
        });
        return () => {
            console.log('transcription view unmounting', {
                chunksCount: chunks.length,
                isLoading
            });
        };
    }, []);
    // Add logging for chunks updates
    (0, react_1.useEffect)(() => {
        var _a;
        console.log('chunks updated in transcription view', {
            count: chunks.length,
            lastChunk: (_a = chunks[chunks.length - 1]) === null || _a === void 0 ? void 0 : _a.text,
            isLoading
        });
    }, [chunks]);
    // Helper functions
    const getDisplaySpeaker = (speaker) => {
        var _a;
        return (_a = speakerMappings[speaker]) !== null && _a !== void 0 ? _a : speaker;
    };
    const formatSpeaker = (speaker) => {
        if (!speaker)
            return 'unknown';
        return speaker.startsWith('speaker_') ? `speaker ${speaker.split('_')[1]}` : speaker;
    };
    // Memoized values
    const uniqueSpeakers = (0, react_1.useMemo)(() => {
        const speakerFirstAppearance = new Map();
        chunks.forEach(chunk => {
            if (chunk.speaker !== undefined) {
                const mappedSpeaker = speakerMappings[chunk.speaker] || chunk.speaker;
                if (!speakerFirstAppearance.has(mappedSpeaker)) {
                    speakerFirstAppearance.set(mappedSpeaker, new Date(chunk.timestamp));
                }
            }
        });
        return Array.from(new Set(chunks.map(chunk => {
            const speaker = chunk.speaker;
            return speaker !== undefined ? speakerMappings[speaker] || speaker : undefined;
        })))
            .filter((s) => s !== undefined)
            .sort((a, b) => {
            var _a, _b;
            const timeA = ((_a = speakerFirstAppearance.get(a)) === null || _a === void 0 ? void 0 : _a.getTime()) || 0;
            const timeB = ((_b = speakerFirstAppearance.get(b)) === null || _b === void 0 ? void 0 : _b.getTime()) || 0;
            return timeB - timeA;
        });
    }, [chunks, speakerMappings]);
    const mergeChunks = (0, react_1.useMemo)(() => {
        const merged = [];
        for (let i = 0; i < chunks.length; i++) {
            const current = chunks[i];
            const prev = merged[merged.length - 1];
            const currentSpeaker = current.speaker !== undefined ? getDisplaySpeaker(current.speaker) : undefined;
            const prevSpeaker = (prev === null || prev === void 0 ? void 0 : prev.speaker) !== undefined ? getDisplaySpeaker(prev.speaker) : undefined;
            if (prev && currentSpeaker === prevSpeaker) {
                merged[merged.length - 1] = Object.assign(Object.assign({}, prev), { text: `${prev.text} ${current.text}` });
            }
            else {
                merged.push(current);
            }
        }
        return merged;
    }, [chunks, speakerMappings]);
    // Load initial state
    (0, react_1.useEffect)(() => {
        console.log('storing chunks in transcription view', {
            count: chunks.length,
            isLoading
        });
        (0, storage_for_live_meeting_2.storeLiveChunks)(chunks);
    }, [chunks]);
    const loadStoredData = () => __awaiter(this, void 0, void 0, function* () {
        try {
            setLoadingHistory(true);
            yield fetchRecentChunks();
            if (data) {
                console.log('loaded stored meeting data:', data);
                setEditedChunks(data.editedChunks);
                setSpeakerMappings(data.speakerMappings);
                lastProcessedChunkRef.current = data.lastProcessedIndex;
                setShowLoadButton(false);
            }
        }
        catch (error) {
            console.error('failed to load history:', error);
        }
        finally {
            setLoadingHistory(false);
        }
    });
    // Store chunks when they update
    (0, react_1.useEffect)(() => {
        console.log('storing chunks:', {
            count: chunks.length,
            isLoading
        });
        (0, storage_for_live_meeting_2.storeLiveChunks)(chunks);
    }, [chunks]);
    // Move handleTextEdit inside the component
    const handleTextEdit = (0, react_1.useCallback)((index, newText) => __awaiter(this, void 0, void 0, function* () {
        console.log('text edited for chunk', index, ':', newText);
        if (!data)
            return;
        const newEditedChunks = Object.assign(Object.assign({}, editedChunks), { [index]: newText });
        setEditedChunks(newEditedChunks);
        yield updateStore(Object.assign(Object.assign({}, data), { editedChunks: newEditedChunks }));
    }), [data, editedChunks, updateStore]);
    const mergeSpeakers = (newSpeaker) => __awaiter(this, void 0, void 0, function* () {
        if (!selectedSpeaker)
            return;
        if (!data)
            return;
        console.log('merging speaker', selectedSpeaker, 'into', newSpeaker);
        const newMappings = Object.assign(Object.assign(Object.assign({}, speakerMappings), { [selectedSpeaker]: newSpeaker }), (targetSpeaker ? { [targetSpeaker]: newSpeaker } : {}));
        setSpeakerMappings(newMappings);
        yield updateStore(Object.assign(Object.assign({}, data), { speakerMappings: newMappings }));
        setMergeModalOpen(false);
        setNameModalOpen(false);
        setTargetSpeaker(null);
        setCustomSpeaker('');
    });
    // Update last processed index
    (0, react_1.useEffect)(() => {
        if (lastProcessedChunkRef.current >= 0) {
            if (data) {
                updateStore(Object.assign(Object.assign({}, data), { lastProcessedIndex: lastProcessedChunkRef.current }));
            }
        }
    }, [lastProcessedChunkRef.current, data, updateStore]);
    // Add selection handler
    const handleSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            setSelectedText('');
            setSelectionPosition(null);
            return;
        }
        const text = selection.toString().trim();
        if (text) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelectedText(text);
            setSelectionPosition({ x: rect.left, y: rect.top });
        }
    };
    // Update vocabulary handler to open dialog
    const addToVocabulary = () => {
        console.log('opening vocabulary dialog for:', selectedText);
        setVocabEntry(selectedText);
        setVocabDialogOpen(true);
        setSelectionPosition(null);
    };
    // Handle saving vocabulary
    const handleSaveVocab = () => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('saving vocabulary:', selectedText, 'as', vocabEntry);
            yield (0, storage_vocabulary_1.addVocabularyEntry)(selectedText, vocabEntry);
            setNotification({ message: "added to vocabulary", type: 'success' });
            setTimeout(() => setNotification(null), 2000);
            setVocabDialogOpen(false);
            setSelectedText('');
            setVocabEntry('');
        }
        catch (error) {
            console.error('failed to save vocabulary:', error);
            setNotification({ message: "failed to save vocabulary", type: 'error' });
            setTimeout(() => setNotification(null), 2000);
        }
    });
    // Process previous merged chunk when a new one arrives
    (0, react_1.useEffect)(() => {
        const currentChunkIndex = mergeChunks.length - 1;
        const previousChunkIndex = currentChunkIndex - 1;
        // Only process if we have a previous chunk and haven't processed it yet
        if (previousChunkIndex >= 0 &&
            previousChunkIndex > lastProcessedChunkRef.current &&
            !improvingChunks[previousChunkIndex]) {
            const improveChunk = () => __awaiter(this, void 0, void 0, function* () {
                setImprovingChunks(prev => (Object.assign(Object.assign({}, prev), { [previousChunkIndex]: true })));
                try {
                    const chunk = mergeChunks[previousChunkIndex];
                    console.log('improving previous merged chunk:', chunk.text);
                    const contextChunks = mergeChunks.slice(Math.max(0, previousChunkIndex - 4), previousChunkIndex + 1);
                    const improved = yield (0, ai_improve_chunk_transcription_1.improveTranscription)(chunk.text, {
                        meetingTitle: title,
                        recentChunks: contextChunks,
                        notes: notes.map(note => note.text),
                    }, settings);
                    if (improved !== chunk.text) {
                        console.log('chunk improved:', improved);
                        yield handleTextEdit(previousChunkIndex, improved);
                        setRecentlyImproved(prev => (Object.assign(Object.assign({}, prev), { [previousChunkIndex]: true })));
                        setTimeout(() => {
                            setRecentlyImproved(prev => (Object.assign(Object.assign({}, prev), { [previousChunkIndex]: false })));
                        }, 1000);
                    }
                    lastProcessedChunkRef.current = previousChunkIndex;
                }
                catch (error) {
                    console.error('failed to improve chunk:', error);
                }
                finally {
                    setImprovingChunks(prev => (Object.assign(Object.assign({}, prev), { [previousChunkIndex]: false })));
                }
            });
            improveChunk();
        }
    }, [mergeChunks, title, notes, settings, data, updateStore, handleTextEdit, improvingChunks]);
    // Update segments when mergeChunks changes
    (0, react_1.useEffect)(() => {
        console.log('updating segments in transcription view', {
            mergedChunksCount: mergeChunks.length,
            editedChunksCount: Object.keys(editedChunks).length,
            speakerMappingsCount: Object.keys(speakerMappings).length
        });
        // Don't call setNotes here as it overwrites meeting notes
        // Instead, update segments separately
    }, [mergeChunks, editedChunks, speakerMappings]);
    const handleGenerateNote = (index) => __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('generating note for chunk:', index);
            const contextChunks = mergeChunks.slice(Math.max(0, index - 4), index + 1);
            const note = yield (0, ai_create_note_based_on_chunk_1.generateMeetingNote)(contextChunks, settings);
            console.log('generated note:', note);
            // Add the generated note to the meeting context
            setNotes([...notes, {
                    id: crypto.randomUUID(),
                    text: note,
                    timestamp: new Date(mergeChunks[index].timestamp)
                }]);
        }
        catch (error) {
            console.error('failed to generate note:', error);
        }
    });
    // Add immediate chunk processing
    (0, react_1.useEffect)(() => {
        console.log('processing new chunks:', {
            total: chunks.length,
            merged: mergeChunks.length
        });
        // Force a re-render when chunks update
        const timer = requestAnimationFrame(() => {
            if (scrollRef.current && isAutoScrollEnabled) {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }
        });
        return () => cancelAnimationFrame(timer);
    }, [chunks, mergeChunks.length]);
    return (<>
            <div className="relative h-full flex flex-col">
                {showLoadButton && (<div className="absolute top-2 right-2 z-10">
                        <button onClick={loadStoredData} className="px-3 py-1 bg-white text-black border border-black text-sm rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2">
                            {loadingHistory ? <lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/> : null}
                            load history
                        </button>
                    </div>)}
                <div ref={scrollRef} onScroll={onScroll} onMouseUp={handleSelection} className="flex-1 overflow-y-auto bg-card min-h-0">
                    {mergeChunks.length === 0 && (<div className="flex items-center justify-center h-full text-gray-500">
                            <p>waiting for transcription...</p>
                        </div>)}
                    {mergeChunks.length > 0 && (<div className="space-y-2 relative p-4">
                            <button onClick={() => setViewMode(prev => {
                if (prev === 'overlay')
                    return 'sidebar';
                if (prev === 'sidebar')
                    return 'timestamp';
                return 'overlay';
            })} className="fixed top-2 left-2 p-2 hover:bg-gray-100 rounded-md transition-colors z-10 bg-background" title={`switch to ${viewMode === 'overlay' ? 'sidebar' : viewMode === 'sidebar' ? 'timestamp' : 'overlay'} view`}>
                                {viewMode === 'overlay' ? <lucide_react_1.LayoutList className="h-4 w-4"/> : viewMode === 'sidebar' ? <lucide_react_1.Layout className="h-4 w-4"/> : <lucide_react_1.Layout className="h-4 w-4"/>}
                            </button>
                            {mergeChunks.map((chunk, i) => {
                var _a, _b, _c;
                return (<div key={i} className="text-sm mb-2 group relative">
                                    {viewMode === 'overlay' ? (<>
                                            <floating_container_buttons_1.ChunkOverlay timestamp={chunk.timestamp} speaker={chunk.speaker} displaySpeaker={chunk.speaker ? getDisplaySpeaker(chunk.speaker) : 'speaker_0'} onSpeakerClick={() => {
                            if (chunk.speaker) {
                                setSelectedSpeaker(chunk.speaker);
                                setMergeModalOpen(true);
                            }
                        }} onGenerateNote={() => handleGenerateNote(i)}/>
                                            <div className="relative">
                                                <div contentEditable suppressContentEditableWarning onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')} className={(0, utils_1.cn)("outline-none focus:ring-1 focus:ring-gray-200 rounded px-1 -mx-1", improvingChunks[i] && "animate-shimmer bg-gradient-to-r from-transparent via-gray-100/50 to-transparent bg-[length:200%_100%]", recentlyImproved[i] && "animate-glow")}>
                                                    {(_a = editedChunks[i]) !== null && _a !== void 0 ? _a : chunk.text}
                                                </div>
                                            </div>
                                        </>) : viewMode === 'timestamp' ? (<div className="flex gap-1">
                                            <div className="w-16 flex-shrink-0 text-xs text-gray-500">
                                                <div>{new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                {chunk.speaker !== undefined && (<button onClick={() => {
                                setSelectedSpeaker(chunk.speaker);
                                setMergeModalOpen(true);
                            }} className="hover:bg-gray-100 rounded-sm transition-colors">
                                                        {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                                                    </button>)}
                                            </div>
                                            <div contentEditable suppressContentEditableWarning onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')} className="outline-none focus:ring-1 focus:ring-gray-200 rounded flex-1">
                                                {(_b = editedChunks[i]) !== null && _b !== void 0 ? _b : chunk.text}
                                            </div>
                                        </div>) : (<div className="flex gap-1">
                                            <div className="w-16 flex-shrink-0 text-xs text-gray-500 flex items-start">
                                                {chunk.speaker !== undefined && (<button onClick={() => {
                                setSelectedSpeaker(chunk.speaker);
                                setMergeModalOpen(true);
                            }} className="hover:bg-gray-100 rounded-sm transition-colors text-left w-full">
                                                        {formatSpeaker(getDisplaySpeaker(chunk.speaker))}
                                                    </button>)}
                                            </div>
                                            <div contentEditable suppressContentEditableWarning onBlur={(e) => handleTextEdit(i, e.currentTarget.textContent || '')} className="outline-none focus:ring-1 focus:ring-gray-200 rounded flex-1">
                                                {(_c = editedChunks[i]) !== null && _c !== void 0 ? _c : chunk.text}
                                            </div>
                                        </div>)}
                                </div>);
            })}
                        </div>)}
                </div>
            </div>

            {!isAutoScrollEnabled && !isScrolledToBottom && (<button onClick={() => { var _a; return (_a = scrollRef.current) === null || _a === void 0 ? void 0 : _a.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }} className="absolute bottom-4 right-4 p-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors">
                    <lucide_react_1.ArrowDown className="h-4 w-4"/>
                </button>)}

            {/* Add vocabulary button */}
            {selectedText && selectionPosition && (<button onClick={addToVocabulary} style={{
                position: 'fixed',
                left: `${selectionPosition.x}px`,
                top: `${selectionPosition.y - 30}px`,
            }} className="px-2 py-1 bg-black text-white text-xs rounded shadow-lg hover:bg-gray-800 transition-colors">
                    add to vocabulary
                </button>)}

            {/* Speaker Merge Modal */}
            <dialog_1.Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
                <dialog_1.DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
                    <dialog_1.DialogHeader>
                        <dialog_1.DialogTitle>Rename or merge {formatSpeaker(getDisplaySpeaker(selectedSpeaker))}</dialog_1.DialogTitle>
                    </dialog_1.DialogHeader>
                    <div className="grid gap-4 py-4 overflow-hidden">
                        <div className="flex gap-2 items-center border-b pb-4">
                            <input type="text" value={customSpeaker} onChange={(e) => setCustomSpeaker(e.target.value)} placeholder="rename speaker" className="flex-1 px-3 py-2 text-sm border rounded-md" onKeyDown={(e) => {
            if (e.key === 'Enter' && customSpeaker.trim()) {
                e.preventDefault();
                mergeSpeakers(customSpeaker.trim());
            }
        }}/>
                            <button onClick={() => mergeSpeakers(customSpeaker.trim())} disabled={!customSpeaker.trim()} className="px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                rename
                            </button>
                        </div>

                        <div className="grid gap-1 overflow-y-auto pr-2">
                            <div className="text-sm text-gray-500 mb-1">or merge with:</div>
                            {uniqueSpeakers
            .filter(s => s !== getDisplaySpeaker(selectedSpeaker))
            .map(speaker => (<button key={speaker} onClick={() => {
                setTargetSpeaker(speaker);
                setNameModalOpen(true);
            }} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors text-sm">
                                        {formatSpeaker(speaker)}
                                    </button>))}
                        </div>
                    </div>
                </dialog_1.DialogContent>
            </dialog_1.Dialog>

            {/* Speaker Name Modal */}
            <dialog_1.Dialog open={nameModalOpen} onOpenChange={setNameModalOpen}>
                <dialog_1.DialogContent className="sm:max-w-md">
                    <dialog_1.DialogHeader>
                        <dialog_1.DialogTitle>Choose new name</dialog_1.DialogTitle>
                    </dialog_1.DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <button onClick={() => mergeSpeakers(getDisplaySpeaker(selectedSpeaker))} className="text-left px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm">
                                keep {formatSpeaker(getDisplaySpeaker(selectedSpeaker))}
                            </button>
                            <button onClick={() => mergeSpeakers(targetSpeaker)} className="text-left px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm">
                                keep {formatSpeaker(targetSpeaker)}
                            </button>
                            <div className="flex gap-2 items-center">
                                <input type="text" value={customSpeaker} onChange={(e) => setCustomSpeaker(e.target.value)} placeholder="enter name" className="flex-1 px-3 py-2 text-sm border rounded-md" onKeyDown={(e) => {
            if (e.key === 'Enter' && customSpeaker.trim()) {
                e.preventDefault();
                mergeSpeakers(customSpeaker.trim());
            }
        }}/>
                                <button onClick={() => mergeSpeakers(customSpeaker.trim())} disabled={!customSpeaker.trim()} className="px-3 py-2 hover:bg-gray-100 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                    use custom
                                </button>
                            </div>
                        </div>
                    </div>
                </dialog_1.DialogContent>
            </dialog_1.Dialog>

            <dialog_1.Dialog open={vocabDialogOpen} onOpenChange={setVocabDialogOpen}>
                <dialog_1.DialogContent className="sm:max-w-md">
                    <dialog_1.DialogHeader>
                        <dialog_1.DialogTitle>add to vocabulary</dialog_1.DialogTitle>
                    </dialog_1.DialogHeader>
                    <div className="flex flex-col gap-4">
                        <input_1.Input value={vocabEntry} onChange={(e) => setVocabEntry(e.target.value)} placeholder="enter corrected text"/>
                        <dialog_2.DialogFooter>
                            <button_1.Button onClick={handleSaveVocab}>
                                save
                            </button_1.Button>
                        </dialog_2.DialogFooter>
                    </div>
                </dialog_1.DialogContent>
            </dialog_1.Dialog>

            {notification && (<div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm ${notification.type === 'success' ? 'bg-black text-white' : 'bg-red-500 text-white'}`}>
                    {notification.message}
                </div>)}
        </>);
}
