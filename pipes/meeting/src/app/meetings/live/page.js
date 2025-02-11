"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LiveMeetingPage;
const navigation_1 = require("next/navigation");
const new_meeting_wrapper_1 = require("@/components/live-transcription/new-meeting-wrapper");
const react_1 = require("react");
const storage_for_live_meeting_1 = require("@/components/live-transcription/hooks/storage-for-live-meeting");
function LiveMeetingPage() {
    const router = (0, navigation_1.useRouter)();
    const mounted = (0, react_1.useRef)(false);
    (0, react_1.useEffect)(() => {
        if (mounted.current)
            return;
        mounted.current = true;
        console.log('live meeting page mounting, pathname:', window.location.pathname);
        return () => {
            console.log('live meeting page unmounting');
            mounted.current = false;
        };
    }, []);
    return (<div className="h-full">
      <storage_for_live_meeting_1.MeetingProvider>
        <new_meeting_wrapper_1.LiveTranscription onBack={() => {
            console.log('live meeting back pressed');
            router.push('/meetings');
        }}/>
      </storage_for_live_meeting_1.MeetingProvider>
    </div>);
}
