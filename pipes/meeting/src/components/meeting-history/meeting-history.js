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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingHistory = MeetingHistory;
const react_1 = require("react");
const use_meetings_1 = require("./hooks/use-meetings");
const meeting_card_1 = require("./components/meeting-card");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const navigation_1 = require("next/navigation");
const meeting_settings_1 = require("./components/meeting-settings");
const storage_for_live_meeting_1 = require("@/components/live-transcription/hooks/storage-for-live-meeting");
const use_settings_1 = require("@/lib/hooks/use-settings");
function MeetingHistory() {
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [showSettings, setShowSettings] = (0, react_1.useState)(false);
    const [windowHeight, setWindowHeight] = (0, react_1.useState)(0);
    const [hasLiveMeeting, setHasLiveMeeting] = (0, react_1.useState)(false);
    const { meetings, loading, error, updateMeetings } = (0, use_meetings_1.useMeetings)();
    const { settings } = (0, use_settings_1.useSettings)();
    const router = (0, navigation_1.useRouter)();
    const handleResume = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!hasLiveMeeting)
            return;
        console.log('resume: attempting navigation to live meeting');
        try {
            const liveData = yield (0, storage_for_live_meeting_1.getLiveMeetingData)();
            console.log('resume: current live meeting state:', {
                hasTitle: !!(liveData === null || liveData === void 0 ? void 0 : liveData.title),
                notesCount: (_a = liveData === null || liveData === void 0 ? void 0 : liveData.notes) === null || _a === void 0 ? void 0 : _a.length,
                firstNote: (_d = (_c = (_b = liveData === null || liveData === void 0 ? void 0 : liveData.notes) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) === null || _d === void 0 ? void 0 : _d.slice(0, 50)
            });
            yield router.push('/meetings/live');
            console.log('resume: navigation completed');
        }
        catch (e) {
            console.error('resume: navigation failed:', e);
        }
    }), [hasLiveMeeting, router]);
    const handleNewMeeting = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        if (hasLiveMeeting) {
            console.log('existing meeting detected, prompting user');
            const confirmed = window.confirm('You have an existing meeting in progress. Start a new one anyway?');
            if (!confirmed) {
                console.log('user chose to resume existing meeting');
                yield handleResume();
                return;
            }
            console.log('user chose to start new meeting, clearing existing data');
            yield (0, storage_for_live_meeting_1.clearLiveMeetingData)();
        }
        console.log('starting new meeting');
        try {
            yield router.push('/meetings/live');
            console.log('navigation completed');
        }
        catch (e) {
            console.error('navigation failed:', e);
        }
    }), [hasLiveMeeting, router, handleResume]);
    (0, react_1.useEffect)(() => {
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);
    (0, react_1.useEffect)(() => {
        const checkLiveMeeting = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const liveData = yield (0, storage_for_live_meeting_1.getLiveMeetingData)();
            console.log('checking for live meeting:', {
                exists: !!liveData,
                title: liveData === null || liveData === void 0 ? void 0 : liveData.title,
                notesCount: (_a = liveData === null || liveData === void 0 ? void 0 : liveData.notes) === null || _a === void 0 ? void 0 : _a.length,
                hasAnalysis: !!(liveData === null || liveData === void 0 ? void 0 : liveData.analysis)
            });
            setHasLiveMeeting(!!liveData);
        });
        checkLiveMeeting();
    }, []);
    (0, react_1.useEffect)(() => {
        setMounted(true);
        console.log('meeting-history mounted');
    }, []);
    const updateHeight = () => {
        const vh = window.innerHeight;
        const headerOffset = 32;
        console.log('meeting list height:', vh, 'header offset:', headerOffset);
        setWindowHeight(vh - headerOffset);
    };
    const handleMeetingUpdate = (id, update) => {
        console.log('handling meeting update:', {
            meetingId: id,
            update,
            currentMeetingsCount: meetings.length
        });
        const updatedMeetings = meetings.map(meeting => {
            return meeting.id === id ? Object.assign(Object.assign({}, meeting), update) : meeting;
        });
        console.log('updated meetings count:', updatedMeetings.length);
        updateMeetings(updatedMeetings);
    };
    if (!mounted)
        return null;
    if (showSettings) {
        return <meeting_settings_1.MeetingSettings onBack={() => setShowSettings(false)}/>;
    }
    if (loading) {
        return (<div className="flex items-center justify-center h-full">
        <lucide_react_1.Loader2 className="h-8 w-8 animate-spin"/>
      </div>);
    }
    return (<div className="h-full flex flex-col">
      <div className="h-4"/>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-muted-foreground uppercase tracking-wider">
          meeting and conversation history
        </h2>
        <div className="flex gap-2">
          <button_1.Button onClick={() => setShowSettings(true)} variant="outline" size="sm">
            <lucide_react_1.Settings className="h-4 w-4"/>
          </button_1.Button>
          {hasLiveMeeting && (<button_1.Button onClick={handleResume} variant="outline" size="sm">
              <lucide_react_1.PlusCircle className="h-4 w-4 mr-2"/>
              resume meeting
            </button_1.Button>)}
          <button_1.Button onClick={handleNewMeeting} variant="default" size="sm">
            <lucide_react_1.PlusCircle className="h-4 w-4 mr-2"/>
            new meeting
          </button_1.Button>
        </div>
      </div>

      <div className="w-full overflow-auto" style={{ height: windowHeight ? `${windowHeight}px` : '100vh' }}>
        {error ? (<div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-destructive">failed to load meetings</p>
          </div>) : (<div className="space-y-6">
            {/* <div className="bg-accent/50 rounded-lg">
              <h3 className="text-xl font-semibold mb-6 text-muted-foreground pl-4">upcoming</h3>
              <UpcomingMeetings />
            </div> */}
            
            <div>
              {Object.entries(groupMeetingsByDate(meetings)).map(([date, dateMeetings]) => (<div key={date}>
                  <h3 className="text-xl font-semibold mb-3 text-muted-foreground">{date}</h3>
                  {dateMeetings.map((meeting) => (<meeting_card_1.MeetingCard key={meeting.id} meeting={meeting} settings={settings} onUpdate={handleMeetingUpdate}/>))}
                </div>))}
            </div>
          </div>)}
      </div>
    </div>);
}
function groupMeetingsByDate(meetings) {
    return meetings.reduce((groups, meeting) => {
        const date = new Date(meeting.meetingStart).toLocaleDateString([], {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(meeting);
        return groups;
    }, {});
}
