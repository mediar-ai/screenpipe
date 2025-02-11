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
exports.MeetingCard = MeetingCard;
const card_1 = require("@/components/ui/card");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const react_1 = require("react");
const ai_meeting_title_1 = require("../ai-meeting-title");
const storage_meeting_data_1 = require("../hooks/storage-meeting-data");
const use_toast_1 = require("@/hooks/use-toast");
const hover_card_1 = require("@/components/ui/hover-card");
const ai_meeting_summary_1 = require("../ai-meeting-summary");
const collapsible_1 = require("@/components/ui/collapsible");
const meeting_prep_card_1 = require("./meeting-prep-card");
function MeetingCard({ meeting, onUpdate, settings }) {
    const [isGenerating, setIsGenerating] = (0, react_1.useState)(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = (0, react_1.useState)(false);
    const { toast } = (0, use_toast_1.useToast)();
    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    const formatDuration = (start, end) => {
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const durationMs = endTime - startTime;
        const minutes = Math.floor(durationMs / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${remainingMinutes}m`;
        }
        return `${minutes}m`;
    };
    const handleGenerateName = () => __awaiter(this, void 0, void 0, function* () {
        if (isGenerating)
            return;
        setIsGenerating(true);
        try {
            if (!settings) {
                throw new Error("no settings found");
            }
            console.log("generating name for meeting:", meeting.id);
            const aiName = yield (0, ai_meeting_title_1.generateMeetingName)(meeting, settings);
            if (!meeting.id) {
                throw new Error("no meeting id found");
            }
            // Update meeting in storage and notify parent
            yield (0, storage_meeting_data_1.updateMeeting)(meeting.id, { aiName });
            onUpdate(meeting.id, { aiName });
            toast({
                title: "name generated",
                description: "ai name has been generated and saved",
            });
        }
        catch (error) {
            console.error("failed to generate name:", error);
            toast({
                title: "generation failed",
                description: "failed to generate ai name. please try again",
                variant: "destructive",
            });
        }
        finally {
            setIsGenerating(false);
        }
    });
    const handleGenerateSummary = () => __awaiter(this, void 0, void 0, function* () {
        if (isGeneratingSummary)
            return;
        setIsGeneratingSummary(true);
        try {
            if (!settings) {
                throw new Error("no settings found");
            }
            console.log("generating summary for meeting:", meeting.id);
            const aiSummary = yield (0, ai_meeting_summary_1.generateMeetingSummary)(meeting, settings);
            if (!meeting.id) {
                throw new Error("no meeting id found");
            }
            // Update meeting in storage and notify parent
            yield (0, storage_meeting_data_1.updateMeeting)(meeting.id, { aiSummary });
            onUpdate(meeting.id, { aiSummary });
            toast({
                title: "summary generated",
                description: "ai summary has been generated and saved",
            });
        }
        catch (error) {
            console.error("failed to generate summary:", error);
            toast({
                title: "generation failed",
                description: "failed to generate ai summary. please try again",
                variant: "destructive",
            });
        }
        finally {
            setIsGeneratingSummary(false);
        }
    });
    const getDurationMinutes = (start, end) => {
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        return Math.floor((endTime - startTime) / (1000 * 60));
    };
    const getDurationScale = (minutes) => {
        // Scale between 0.5 and 1 for meetings between 0 and 60 minutes
        const scale = 0.5 + Math.min(minutes / 60, 1) * 0.5;
        return `scale-y-[${scale}]`;
    };
    const durationMinutes = getDurationMinutes(meeting.meetingStart, meeting.meetingEnd);
    const scaleClass = getDurationScale(durationMinutes);
    return (<card_1.Card className="w-full mb-1 border-0 -mx-2">
      <card_1.CardContent className="p-3 relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground/10 origin-bottom transition-transform duration-500" style={{
            transform: `scaleY(${0.5 + Math.min(durationMinutes / 60, 1) * 0.5})`,
            opacity: 0.2
        }}/>
        <div className="flex gap-4">
          <div className="flex-none w-[30%]">
            <h3 className="text-base font-bold">
              {(meeting.humanName || meeting.aiName || "untitled meeting").replace(/^"|"$/g, '')}
            </h3>
            <div className="text-sm text-muted-foreground flex items-center justify-between">
              <div className="flex items-center">
                {formatTime(meeting.meetingStart)} • {formatDuration(meeting.meetingStart, meeting.meetingEnd)}
                <div className="h-3 w-2 bg-muted-foreground/20 origin-left transition-transform duration-500 ml-2" style={{ transform: `scaleX(${0.5 + Math.min(durationMinutes / 60, 1) * 5.0})` }}/>
              </div>
              <div className="flex">
                <hover_card_1.HoverCard openDelay={0} closeDelay={0}>
                  <hover_card_1.HoverCardTrigger asChild>
                    <button_1.Button variant="ghost" size="sm" className="h-6 px-1" onClick={handleGenerateName} disabled={isGenerating}>
                      <lucide_react_1.Wand2 className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`}/>
                    </button_1.Button>
                  </hover_card_1.HoverCardTrigger>
                  <hover_card_1.HoverCardContent className="w-auto p-2">
                    <span className="text-sm text-muted-foreground">
                      re-generate an ai name for this meeting
                    </span>
                  </hover_card_1.HoverCardContent>
                </hover_card_1.HoverCard>
                <hover_card_1.HoverCard openDelay={0} closeDelay={0}>
                  <hover_card_1.HoverCardTrigger asChild>
                    <button_1.Button variant="ghost" size="sm" className="h-6 px-1" onClick={handleGenerateSummary} disabled={isGeneratingSummary}>
                      <lucide_react_1.FileText className={`h-4 w-4 ${isGeneratingSummary ? "animate-spin" : ""}`}/>
                    </button_1.Button>
                  </hover_card_1.HoverCardTrigger>
                  <hover_card_1.HoverCardContent className="w-auto p-2">
                    <span className="text-sm text-muted-foreground">
                      generate an ai summary for this meeting
                    </span>
                  </hover_card_1.HoverCardContent>
                </hover_card_1.HoverCard>
                {meeting.aiPrep && (<hover_card_1.HoverCard openDelay={0} closeDelay={0}>
                    <hover_card_1.HoverCardTrigger asChild>
                      <collapsible_1.Collapsible>
                        <collapsible_1.CollapsibleTrigger asChild>
                          <button_1.Button variant="ghost" size="sm" className="h-6 px-1 flex items-center gap-1 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300">
                            <span className="text-xs">ai prep</span>
                            <lucide_react_1.ChevronDown className="h-4 w-4"/>
                          </button_1.Button>
                        </collapsible_1.CollapsibleTrigger>
                        <collapsible_1.CollapsibleContent className="absolute left-0 right-0 mt-2 z-20 bg-white dark:bg-gray-950 border rounded-md p-4 shadow-lg">
                          <meeting_prep_card_1.MeetingPrepDetails aiPrep={meeting.aiPrep}/>
                        </collapsible_1.CollapsibleContent>
                      </collapsible_1.Collapsible>
                    </hover_card_1.HoverCardTrigger>
                    <hover_card_1.HoverCardContent className="w-auto p-2">
                      <span className="text-sm text-muted-foreground">
                        view ai-generated meeting preparation insights
                      </span>
                    </hover_card_1.HoverCardContent>
                  </hover_card_1.HoverCard>)}
              </div>
            </div>
          </div>
          <div className="flex-1">
            {meeting.agenda && (<div className="text-sm text-muted-foreground mb-2">
                {meeting.agenda}
              </div>)}
            {meeting.aiSummary && (<div className="text-sm text-muted-foreground">
                {meeting.aiSummary}
              </div>)}
          </div>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
