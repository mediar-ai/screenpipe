"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveTranscription = LiveTranscription;
const react_1 = require("react");
const use_transcription_service_1 = require("@/components/live-transcription/use-transcription-service");
const auto_scroll_1 = require("@/components/live-transcription/hooks/auto-scroll");
const notes_editor_1 = require("@/components/live-transcription/notes-editor");
const dialog_1 = require("@/components/ui/dialog");
const react_split_1 = __importDefault(require("react-split"));
const transcription_view_1 = require("@/components/live-transcription/transcription-view");
const navigation_1 = require("next/navigation");
const use_settings_1 = require("@/lib/hooks/use-settings");
const storage_for_live_meeting_1 = require("./hooks/storage-for-live-meeting");
function LiveTranscription({ onBack }) {
    const { chunks, isLoadingRecent: isLoading, } = (0, use_transcription_service_1.useTranscriptionService)();
    const { scrollRef, onScroll, isScrolledToBottom } = (0, auto_scroll_1.useAutoScroll)(chunks);
    const [windowHeight, setWindowHeight] = (0, react_1.useState)(0);
    const [mergeModalOpen, setMergeModalOpen] = (0, react_1.useState)(false);
    const [sizes, setSizes] = (0, react_1.useState)([50, 50]);
    const router = (0, navigation_1.useRouter)();
    const { settings } = (0, use_settings_1.useSettings)();
    const updateHeight = () => {
        const vh = window.innerHeight;
        const headerOffset = 32;
        console.log('window height:', vh, 'header offset:', headerOffset);
        setWindowHeight(vh - headerOffset);
    };
    // Window resize handler
    (0, react_1.useEffect)(() => {
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []); // Empty deps array since updateHeight is stable
    const handleTimeClick = (timestamp) => {
        console.log('clicking time:', timestamp);
        const transcriptTime = chunks.findIndex(chunk => {
            return new Date(chunk.timestamp) >= timestamp;
        });
        console.log('found index:', transcriptTime, 'of', chunks.length);
        if (transcriptTime !== -1 && scrollRef.current) {
            const container = scrollRef.current.querySelector('.space-y-2');
            if (container && container.children[transcriptTime]) {
                container.children[transcriptTime].scrollIntoView({ behavior: 'smooth' });
            }
        }
    };
    const onDragEnd = (newSizes) => {
        setSizes(newSizes);
    };
    const onDrag = (newSizes) => {
        // Auto collapse while dragging
        if (newSizes[0] < 25)
            setSizes([0, 100]);
        if (newSizes[1] < 25)
            setSizes([100, 0]);
    };
    const handleBack = () => {
        console.log('navigating back to meeting history');
        router.push('/meetings');
    };
    return (<div className="h-full flex flex-col">
            <div className="w-full" style={{ height: windowHeight ? `${windowHeight}px` : '100vh' }}>
                <react_split_1.default className="flex gap-0 h-full [&_.gutter]:bg-gray-100 [&_.gutter]:bg-dotted [&_.gutter]:w-[3px] [&_.gutter]:mx-1 [&_.gutter]:cursor-col-resize" sizes={sizes} minSize={0} snapOffset={100} onDragEnd={onDragEnd} onDrag={onDrag}>
                    {/* Transcription Panel */}
                    <div className="flex flex-col relative">
                        <transcription_view_1.TranscriptionView chunks={chunks} settings={settings} isLoading={isLoading} isAutoScrollEnabled={isScrolledToBottom} scrollRef={scrollRef} onScroll={onScroll} isScrolledToBottom={isScrolledToBottom}/>
                    </div>

                    {/* Notes Panel */}
                    <div>
                        <notes_editor_1.NotesEditor onTimeClick={handleTimeClick} onBack={handleBack} onNewMeeting={() => {
            (0, storage_for_live_meeting_1.clearLiveMeetingData)();
            router.refresh();
        }}/>
                    </div>
                </react_split_1.default>

                <dialog_1.Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
                    <dialog_1.DialogContent>
                        <dialog_1.DialogHeader>
                            <dialog_1.DialogTitle>Merge Speakers</dialog_1.DialogTitle>
                        </dialog_1.DialogHeader>
                        {/* Dialog content */}
                    </dialog_1.DialogContent>
                </dialog_1.Dialog>
            </div>
        </div>);
}
