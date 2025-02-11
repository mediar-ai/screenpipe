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
exports.useTranscriptionStream = useTranscriptionStream;
const react_1 = require("react");
const use_toast_1 = require("@/hooks/use-toast");
function useTranscriptionStream(setChunks) {
    const streamingRef = (0, react_1.useRef)(false);
    const { toast } = (0, use_toast_1.useToast)();
    const stopTranscriptionScreenpipe = (0, react_1.useCallback)(() => {
        if (window._eventSource) {
            console.log('stopping screenpipe transcription');
            window._eventSource.close();
            window._eventSource = undefined;
            streamingRef.current = false;
        }
    }, []);
    const startTranscriptionScreenpipe = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        if (streamingRef.current) {
            console.log('transcription already streaming');
            return;
        }
        try {
            console.log('starting transcription stream...');
            if (window._eventSource) {
                console.log('closing existing event source');
                window._eventSource.close();
            }
            streamingRef.current = true;
            const eventSource = new EventSource('http://localhost:3030/sse/transcriptions');
            window._eventSource = eventSource;
            eventSource.onopen = () => {
                console.log('sse connection opened');
            };
            let currentChunk = null;
            eventSource.onmessage = (event) => {
                if (event.data === 'keep-alive-text')
                    return;
                const chunk = JSON.parse(event.data);
                console.log('new transcription chunk:', chunk);
                // If same speaker, append text with typing effect
                if (currentChunk && currentChunk.speaker === chunk.speaker) {
                    const words = chunk.transcription.split(' ');
                    let wordIndex = 0;
                    const typeWords = () => {
                        if (wordIndex < words.length) {
                            currentChunk.text += (currentChunk.text ? ' ' : '') + words[wordIndex];
                            setChunks(prev => [...prev.slice(0, -1), Object.assign({}, currentChunk)]);
                            wordIndex++;
                            setTimeout(typeWords, 20);
                        }
                    };
                    typeWords();
                }
                else {
                    // New speaker or first chunk, create new entry
                    currentChunk = {
                        id: Date.now(),
                        timestamp: chunk.timestamp,
                        text: chunk.transcription,
                        isInput: chunk.is_input,
                        device: chunk.device,
                        speaker: chunk.speaker
                    };
                    setChunks(prev => [...prev, currentChunk]);
                }
            };
            eventSource.onerror = (error) => {
                console.error("sse error:", error);
                eventSource.close();
                streamingRef.current = false;
                toast({
                    title: "transcription error",
                    description: "failed to stream audio. retrying...",
                    variant: "destructive"
                });
                console.log('scheduling retry...');
                setTimeout(startTranscriptionScreenpipe, 1000);
            };
        }
        catch (error) {
            console.error("failed to start transcription:", error);
            streamingRef.current = false;
        }
    }), [toast, setChunks]);
    return {
        startTranscriptionScreenpipe,
        stopTranscriptionScreenpipe,
        isStreaming: streamingRef.current
    };
}
