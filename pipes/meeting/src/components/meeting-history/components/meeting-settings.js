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
exports.MeetingSettings = MeetingSettings;
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const input_1 = require("@/components/ui/input");
const lucide_react_1 = require("lucide-react");
const react_1 = require("react");
const storage_meeting_data_1 = require("../hooks/storage-meeting-data");
const storage_for_live_meeting_1 = require("../../live-transcription/hooks/storage-for-live-meeting");
function MeetingSettings({ onBack }) {
    var _a;
    const [stats, setStats] = (0, react_1.useState)();
    const [showRawData, setShowRawData] = (0, react_1.useState)(false);
    const [rawData, setRawData] = (0, react_1.useState)();
    const [transcriptionMode, setTranscriptionMode] = (0, react_1.useState)('browser');
    (0, react_1.useEffect)(() => {
        const loadData = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const meetings = yield (0, storage_meeting_data_1.getMeetings)();
                const updates = yield (0, storage_meeting_data_1.getAllUpdates)();
                // Get all live meetings
                const liveKeys = yield storage_for_live_meeting_1.liveStore.keys();
                const liveMeetings = {};
                for (const key of liveKeys) {
                    liveMeetings[key] = yield storage_for_live_meeting_1.liveStore.getItem(key);
                }
                console.log('loaded storage data:', {
                    meetingsCount: (meetings === null || meetings === void 0 ? void 0 : meetings.length) || 0,
                    updatesCount: Object.keys(updates || {}).length,
                    liveMeetingsCount: Object.keys(liveMeetings).length
                });
                // Set stats with null checks
                const stats = {
                    meetingsCount: (meetings === null || meetings === void 0 ? void 0 : meetings.length) || 0,
                    updatesCount: Object.keys(updates || {}).length,
                    liveMeetingsCount: Object.keys(liveMeetings).length,
                    meetingsSize: (new TextEncoder().encode(JSON.stringify(meetings || [])).length / 1024).toFixed(2) + 'kb',
                    updatesSize: (new TextEncoder().encode(JSON.stringify(updates || {})).length / 1024).toFixed(2) + 'kb',
                    liveMeetingsSize: (new TextEncoder().encode(JSON.stringify(liveMeetings)).length / 1024).toFixed(2) + 'kb',
                    orphanedUpdates: Object.keys(updates || {}).filter(id => !(meetings === null || meetings === void 0 ? void 0 : meetings.some(m => m.id === id)))
                };
                setStats(stats);
                // Set raw data
                setRawData({
                    meetings: meetings || [],
                    updates: updates || {},
                    liveMeetings
                });
            }
            catch (error) {
                console.error('failed to load storage data:', error);
            }
        });
        loadData();
    }, []);
    return (<div className="h-full w-full overflow-auto p-6">
      {/* header with title and back button */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">settings</h1>
        <button_1.Button variant="outline" onClick={onBack}>
          <lucide_react_1.ArrowLeft className="h-4 w-4 mr-2"/>
          back
        </button_1.Button>
      </div>

      {/* transcription mode selector */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">transcription mode</h2>
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button className={`flex-1 px-4 py-2 rounded-md transition-colors ${transcriptionMode === 'screenpipe'
            ? 'bg-background shadow-sm'
            : 'hover:bg-background/50'}`} onClick={() => {
            console.log('changing transcription mode to: screenpipe');
            setTranscriptionMode('screenpipe');
        }}>
            screenpipe
          </button>
          <button className={`flex-1 px-4 py-2 rounded-md transition-colors ${transcriptionMode === 'browser'
            ? 'bg-background shadow-sm'
            : 'hover:bg-background/50'}`} onClick={() => {
            console.log('changing transcription mode to: browser');
            setTranscriptionMode('browser');
        }}>
            browser
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {transcriptionMode === 'screenpipe'
            ? 'uses screenpipe to power your meeting notes'
            : 'use browser-based transcription, no extra local context available'}
        </p>
      </div>

      {/* storage stats section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">storage stats</h2>
        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>meetings count</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.meetingsCount) || 0}</div>
          
          <div>updates count</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.updatesCount) || 0}</div>
          
          <div>live meetings count</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.liveMeetingsCount) || 0}</div>
          
          <div>meetings size</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.meetingsSize) || '0kb'}</div>
          
          <div>updates size</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.updatesSize) || '0kb'}</div>

          <div>live meetings size</div>
          <div>{(stats === null || stats === void 0 ? void 0 : stats.liveMeetingsSize) || '0kb'}</div>
          
          <div>orphaned updates</div>
          <div>{((_a = stats === null || stats === void 0 ? void 0 : stats.orphanedUpdates) === null || _a === void 0 ? void 0 : _a.length) || 0}</div>
        </div>
      </div>

      {/* Raw Data Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">raw storage data</h2>
          <button_1.Button variant="ghost" size="sm" onClick={() => setShowRawData(!showRawData)}>
            {showRawData ? (<><lucide_react_1.EyeOff className="h-4 w-4 mr-2"/> hide</>) : (<><lucide_react_1.Eye className="h-4 w-4 mr-2"/> show</>)}
          </button_1.Button>
        </div>

        {showRawData && rawData && (<div className="space-y-4">
            <card_1.Card className="p-4">
              <h3 className="text-sm font-medium mb-2">live meetings ({Object.keys(rawData.liveMeetings).length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.liveMeetings, null, 2)}
              </pre>
            </card_1.Card>

            <card_1.Card className="p-4">
              <h3 className="text-sm font-medium mb-2">stored meetings ({rawData.meetings.length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.meetings, null, 2)}
              </pre>
            </card_1.Card>

            <card_1.Card className="p-4">
              <h3 className="text-sm font-medium mb-2">updates ({Object.keys(rawData.updates).length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.updates, null, 2)}
              </pre>
            </card_1.Card>
          </div>)}
      </div>

      {/* ai prompts section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">ai prompts</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">title generation prompt</label>
            <input_1.Input className="border-2" placeholder="generate a concise title for this meeting..."/>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">summary generation prompt</label>
            <input_1.Input className="border-2" placeholder="summarize the key points of this meeting..."/>
          </div>
        </div>
      </div>

      {/* meeting detection section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">meeting detection</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">silence threshold (minutes)</label>
            <input_1.Input type="number" className="border-2" placeholder="5"/>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">minimum symbols to keep meeting</label>
            <input_1.Input type="number" className="border-2" placeholder="100"/>
          </div>
        </div>
      </div>

      {/* danger zone section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive">danger zone</h2>
        <button_1.Button variant="destructive" className="w-full">
          <lucide_react_1.Trash2 className="h-4 w-4 mr-2"/>
          erase all meetings data
        </button_1.Button>
      </div>
    </div>);
}
