"use strict";
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
exports.useTranscriptionService = useTranscriptionService;
const pull_meetings_from_screenpipe_1 = require("./hooks/pull-meetings-from-screenpipe");
const screenpipe_stream_transcription_api_1 = require("./hooks/screenpipe-stream-transcription-api");
const browser_stream_transcription_api_1 = require("./hooks/browser-stream-transcription-api");
const react_1 = require("react");
const storage_for_live_meeting_1 = require("./hooks/storage-for-live-meeting");
const react_2 = require("posthog-js/react");
function useTranscriptionService(mode = 'browser') {
    const { chunks, setChunks, isLoading, fetchRecentChunks } = (0, pull_meetings_from_screenpipe_1.useRecentChunks)();
    const { startTranscriptionScreenpipe, stopTranscriptionScreenpipe } = (0, screenpipe_stream_transcription_api_1.useTranscriptionStream)(setChunks);
    const { startTranscriptionBrowser, stopTranscriptionBrowser } = (0, browser_stream_transcription_api_1.useBrowserTranscriptionStream)(setChunks);
    const initRef = (0, react_1.useRef)(false);
    const modeRef = (0, react_1.useRef)(null);
    const posthog = (0, react_2.usePostHog)();
    // Load stored chunks only once
    (0, react_1.useEffect)(() => {
        const loadStoredChunks = () => __awaiter(this, void 0, void 0, function* () {
            if (initRef.current)
                return;
            initRef.current = true;
            const storedData = yield (0, storage_for_live_meeting_1.getLiveMeetingData)();
            if (storedData === null || storedData === void 0 ? void 0 : storedData.chunks) {
                console.log('transcription-service: loading stored chunks:', storedData.chunks.length);
                setChunks(storedData.chunks);
            }
        });
        loadStoredChunks();
    }, [setChunks]);
    // Handle transcription mode initialization and changes
    (0, react_1.useEffect)(() => {
        // First mount or mode change
        if (modeRef.current !== mode) {
            console.log('transcription-service: mode', modeRef.current ? 'changed from ' + modeRef.current + ' to: ' + mode : 'initialized to: ' + mode);
            // Track mode change in PostHog
            posthog.capture('meeting_web_app_transcription_mode_changed', {
                from: modeRef.current || 'initial',
                to: mode
            });
            // Stop any existing transcription
            if (modeRef.current) {
                if (modeRef.current === 'browser') {
                    stopTranscriptionBrowser();
                }
                else {
                    stopTranscriptionScreenpipe();
                }
            }
            // Update mode ref before starting new transcription
            modeRef.current = mode;
            // Start new transcription based on mode
            if (mode === 'screenpipe') {
                console.log('transcription-service: starting screenpipe transcription');
                posthog.capture('meeting_web_app_transcription_started', { mode: 'screenpipe' });
                startTranscriptionScreenpipe();
            }
            else {
                console.log('transcription-service: starting browser transcription');
                posthog.capture('meeting_web_app_transcription_started', { mode: 'browser' });
                startTranscriptionBrowser();
            }
        }
        else {
            console.log('transcription-service: mode unchanged:', mode);
        }
        // Cleanup function
        return () => {
            console.log('transcription-service: cleanup for mode:', modeRef.current);
            if (modeRef.current === 'browser') {
                stopTranscriptionBrowser();
            }
            else if (modeRef.current === 'screenpipe') {
                stopTranscriptionScreenpipe();
            }
            if (modeRef.current) {
                posthog.capture('meeting_web_app_transcription_stopped', { mode: modeRef.current });
            }
        };
    }, [mode, startTranscriptionScreenpipe, stopTranscriptionScreenpipe, startTranscriptionBrowser, stopTranscriptionBrowser, posthog]);
    return {
        chunks,
        isLoadingRecent: isLoading,
        fetchRecentChunks
    };
}
