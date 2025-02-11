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
exports.AIPanel = AIPanel;
const react_1 = require("react");
const ai_1 = require("ai");
const openai_1 = require("openai");
const chat_message_1 = require("@/components/chat-message");
const use_toast_1 = require("@/components/ui/use-toast");
const input_1 = require("@/components/ui/input");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const use_timeline_selection_1 = require("@/lib/hooks/use-timeline-selection");
const browser_1 = require("@screenpipe/browser");
const use_ai_provider_1 = require("@/lib/hooks/use-ai-provider");
const tooltip_1 = require("@/components/ui/tooltip");
const use_settings_1 = require("@/lib/hooks/use-settings");
function AIPanel({ position, onPositionChange, onClose, frames, agents, isExpanded, onExpandedChange, }) {
    const { settings } = (0, use_settings_1.useSettings)();
    const [chatMessages, setChatMessages] = (0, react_1.useState)([]);
    const [isAiLoading, setIsAiLoading] = (0, react_1.useState)(false);
    const [isStreaming, setIsStreaming] = (0, react_1.useState)(false);
    const [aiInput, setAiInput] = (0, react_1.useState)("");
    const [selectedAgent, setSelectedAgent] = (0, react_1.useState)(agents[0]);
    const [isDraggingPanel, setIsDraggingPanel] = (0, react_1.useState)(false);
    const [dragOffset, setDragOffset] = (0, react_1.useState)({ x: 0, y: 0 });
    const [chatWindowSize, setChatWindowSize] = (0, react_1.useState)({
        width: 400,
        height: 500,
    });
    const [osType, setOsType] = (0, react_1.useState)("");
    const inputRef = (0, react_1.useRef)(null);
    const aiPanelRef = (0, react_1.useRef)(null);
    const resizerRef = (0, react_1.useRef)(null);
    const { toast } = (0, use_toast_1.useToast)();
    const { selectionRange, setSelectionRange } = (0, use_timeline_selection_1.useTimelineSelection)();
    const { isAvailable, error } = (0, use_ai_provider_1.useAiProvider)(settings);
    // Add abort controller ref
    const abortControllerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const detectOS = () => {
            // Try using modern API first
            if ("userAgentData" in navigator) {
                // @ts-ignore - userAgentData is not yet in all TypeScript definitions
                return navigator.userAgentData.platform;
            }
            // Fallback to user agent string parsing
            const userAgent = window.navigator.userAgent.toLowerCase();
            if (userAgent.includes("mac"))
                return "macos";
            if (userAgent.includes("win"))
                return "windows";
            if (userAgent.includes("linux"))
                return "linux";
            return "unknown";
        };
        setOsType(detectOS());
    }, []);
    const handlePanelMouseDown = (e) => {
        e.preventDefault();
        setIsDraggingPanel(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };
    (0, react_1.useEffect)(() => {
        const handleGlobalMouseMove = (e) => {
            if (isDraggingPanel) {
                e.preventDefault();
                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;
                const maxX = window.innerWidth - chatWindowSize.width;
                const maxY = window.innerHeight - chatWindowSize.height;
                onPositionChange({
                    x: Math.max(0, Math.min(maxX, newX)),
                    y: Math.max(0, Math.min(maxY, newY)),
                });
            }
        };
        const handleGlobalMouseUp = () => {
            setIsDraggingPanel(false);
        };
        if (isDraggingPanel) {
            document.addEventListener("mousemove", handleGlobalMouseMove);
            document.addEventListener("mouseup", handleGlobalMouseUp);
        }
        return () => {
            document.removeEventListener("mousemove", handleGlobalMouseMove);
            document.removeEventListener("mouseup", handleGlobalMouseUp);
        };
    }, [
        isDraggingPanel,
        dragOffset,
        chatWindowSize.width,
        chatWindowSize.height,
        onPositionChange,
    ]);
    // Add keyboard shortcut handler
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) &&
                e.key.toLowerCase() === "k" &&
                !isExpanded) {
                e.preventDefault();
                onExpandedChange(true);
                setTimeout(() => {
                    var _a;
                    (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
                }, 100);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isExpanded, onExpandedChange]);
    const handleMouseDown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = chatWindowSize.width;
        const startHeight = chatWindowSize.height;
        const handleMouseMove = (moveEvent) => {
            const newWidth = Math.max(200, startWidth + moveEvent.clientX - startX);
            const newHeight = Math.max(200, startHeight + moveEvent.clientY - startY);
            setChatWindowSize({ width: newWidth, height: newHeight });
        };
        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };
    const handleAgentChange = (agentId) => {
        const newAgent = agents.find((a) => a.id === agentId) || agents[0];
        setSelectedAgent(newAgent);
    };
    const handleClose = () => {
        // Abort any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsAiLoading(false);
        setIsStreaming(false);
        setChatMessages([]);
        setAiInput("");
        onClose();
        setSelectionRange(null);
    };
    const handleStopStreaming = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsStreaming(false);
            setIsAiLoading(false);
        }
    };
    const handleAiSubmit = (e) => __awaiter(this, void 0, void 0, function* () {
        browser_1.pipe.captureMainFeatureEvent("rewind-ai-panel", {
            action: "ai-submit",
        });
        e.preventDefault();
        if (!selectionRange || !aiInput.trim())
            return;
        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();
        const userMessage = {
            id: (0, ai_1.generateId)(),
            role: "user",
            content: aiInput,
        };
        setChatMessages((prev) => [...prev, userMessage]);
        setAiInput("");
        setIsAiLoading(true);
        setIsStreaming(true);
        try {
            const relevantFrames = frames.filter((frame) => {
                const frameTime = new Date(frame.timestamp).getTime();
                const startTime = new Date(selectionRange.start).getTime();
                const endTime = new Date(selectionRange.end).getTime();
                const isInRange = frameTime >= startTime && frameTime <= endTime;
                return isInRange;
            });
            const openai = new openai_1.OpenAI({
                apiKey: settings.aiProviderType === "screenpipe-cloud"
                    ? settings.user.token
                    : settings.openaiApiKey,
                baseURL: settings.aiUrl,
                dangerouslyAllowBrowser: true,
            });
            let currentResponse = "";
            setChatMessages((prev) => [
                ...prev,
                { id: (0, ai_1.generateId)(), role: "assistant", content: "" },
            ]);
            yield selectedAgent.analyze(relevantFrames, openai, {
                model: settings.aiModel,
                onProgress: (chunk) => {
                    currentResponse = chunk;
                    setChatMessages((prev) => [
                        ...prev.slice(0, -1),
                        { id: (0, ai_1.generateId)(), role: "assistant", content: currentResponse },
                    ]);
                },
                signal: abortControllerRef.current.signal,
            }, aiInput);
        }
        catch (error) {
            // Only show error if not aborted
            if (!(error instanceof Error && error.name === "AbortError")) {
                console.error("Error generating AI response:", error);
                toast({
                    title: "error",
                    description: "failed to generate AI response. please try again.",
                    variant: "destructive",
                });
            }
        }
        finally {
            setIsAiLoading(false);
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    });
    if (!selectionRange)
        return null;
    return (<div ref={aiPanelRef} className="ai-panel bg-background border border-muted-foreground rounded-lg shadow-lg transition-all duration-300 ease-in-out z-[100]" style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: chatWindowSize.width,
            height: isExpanded ? chatWindowSize.height : 120,
            cursor: isDraggingPanel ? "grabbing" : "default",
        }}>
			<div className="select-none cursor-grab active:cursor-grabbing" onMouseDown={handlePanelMouseDown}>
				<div className="p-4 border-b border-muted-foreground flex justify-between items-center group">
					<div className="flex items-center gap-2 flex-1">
						<lucide_react_1.GripHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-foreground"/>
						<div className="text-muted-foreground text-xs">
							{new Date(selectionRange.start).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })}
							{" - "}
							{new Date(selectionRange.end).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })}
						</div>
					</div>
					<button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors ml-2">
						<lucide_react_1.X className="h-4 w-4"/>
					</button>
				</div>

				{!isExpanded && (<div className="p-4">
						<button className="px-3 py-1 bg-background hover:bg-accent border text-foreground text-xs rounded flex items-center gap-2 transition-colors" onClick={(e) => {
                e.stopPropagation();
                onExpandedChange(true);
                setTimeout(() => {
                    var _a;
                    (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
                }, 100);
            }}>
							<span>ask ai</span>
							<span className="text-muted-foreground text-[10px]">
								{osType === "macos" ? "⌘K" : "Ctrl+K"}
							</span>
						</button>
					</div>)}
			</div>

			{isExpanded && (<div className="flex flex-col h-[calc(100%-52px)]">
					<div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 hover:cursor-auto text-foreground font-mono text-sm leading-relaxed " style={{
                WebkitUserSelect: "text",
                userSelect: "text",
                MozUserSelect: "text",
                msUserSelect: "text",
                overscrollBehavior: "contain",
                overflowY: "scroll",
                height: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
            }}>
						{chatMessages.map((msg, index) => (<chat_message_1.ChatMessage key={index} message={msg}/>))}
						{isAiLoading && (<div className="flex justify-center">
								<lucide_react_1.Loader2 className="h-6 w-6 animate-spin text-foreground"/>
							</div>)}
					</div>

					<form onSubmit={handleAiSubmit} className="p-3 border-t border-muted-foreground">
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<tooltip_1.TooltipProvider>
									<tooltip_1.Tooltip>
										<tooltip_1.TooltipTrigger>
											<lucide_react_1.Bot className="h-4 w-4 text-muted-foreground"/>
										</tooltip_1.TooltipTrigger>
										<tooltip_1.TooltipContent>
											<p className="text-xs">using {settings.aiModel}</p>
										</tooltip_1.TooltipContent>
									</tooltip_1.Tooltip>
								</tooltip_1.TooltipProvider>
								<select value={selectedAgent.id} onChange={(e) => handleAgentChange(e.target.value)} className="w-full bg-background border border-muted-foreground text-foreground rounded px-2 py-1 text-xs">
									{agents.map((agent) => (<option key={agent.id} value={agent.id} className="bg-background text-foreground">
											{agent.name} - {agent.description}
										</option>))}
								</select>
							</div>
							<div className="flex gap-2">
								<tooltip_1.TooltipProvider>
									<tooltip_1.Tooltip open={!isAvailable}>
										<tooltip_1.TooltipTrigger asChild>
											<div className="flex-1">
												<input_1.Input ref={inputRef} type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="ask about this time range..." className="flex-1 bg-background border border-muted-foreground text-foreground placeholder-muted-foreground" disabled={isAiLoading || !isAvailable}/>
											</div>
										</tooltip_1.TooltipTrigger>
										<tooltip_1.TooltipContent side="top">
											<p className="text-sm text-destructive">{error}</p>
										</tooltip_1.TooltipContent>
									</tooltip_1.Tooltip>
								</tooltip_1.TooltipProvider>
								<button_1.Button type="submit" variant="outline" className="hover:bg-accent transition-colors" disabled={!isAvailable} onClick={isStreaming ? handleStopStreaming : handleAiSubmit}>
									{isStreaming ? (<lucide_react_1.Square className="h-4 w-4"/>) : (<lucide_react_1.Send className="h-4 w-4"/>)}
								</button_1.Button>
							</div>
						</div>
					</form>
				</div>)}

			<div ref={resizerRef} onMouseDown={handleMouseDown} className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent" style={{
            borderTopLeftRadius: "4px",
            borderBottomRightRadius: "4px",
            cursor: "se-resize",
        }}/>
		</div>);
}
