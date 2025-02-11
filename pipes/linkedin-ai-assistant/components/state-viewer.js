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
exports.default = StateViewer;
const react_1 = require("react");
const framer_motion_1 = require("framer-motion");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const collapsible_1 = require("@/components/ui/collapsible");
function StateViewer({ defaultOpen = true }) {
    const [data, setData] = (0, react_1.useState)(null);
    const [profiles, setProfiles] = (0, react_1.useState)({});
    const [messages, setMessages] = (0, react_1.useState)({});
    const [sortField, setSortField] = (0, react_1.useState)('timestamp');
    const [sortDirection, setSortDirection] = (0, react_1.useState)('asc');
    const previousProfilesRef = (0, react_1.useRef)([]);
    const [isCheckingMessages, setIsCheckingMessages] = (0, react_1.useState)(false);
    const [isOpen, setIsOpen] = (0, react_1.useState)(defaultOpen);
    (0, react_1.useEffect)(() => {
        const fetchData = () => __awaiter(this, void 0, void 0, function* () {
            if (!isOpen)
                return;
            try {
                console.log('fetching data...');
                const [stateRes, profilesRes, messagesRes] = yield Promise.all([
                    fetch('/api/state'),
                    fetch('/api/profiles'),
                    fetch('/api/messages')
                ]);
                if (!stateRes.ok || !profilesRes.ok || !messagesRes.ok) {
                    console.error('one or more api calls failed');
                    return;
                }
                const [newState, newProfiles, newMessages] = yield Promise.all([
                    stateRes.json(),
                    profilesRes.json(),
                    messagesRes.json()
                ]);
                console.log('data fetched successfully:', { newState, newProfiles, newMessages });
                if (data) {
                    const currentProfiles = [
                        ...data.visitedProfiles.map((p, i) => (Object.assign(Object.assign({}, p), { status: 'visited', originalIndex: i }))),
                        ...data.toVisitProfiles.map((p, i) => (Object.assign(Object.assign({}, p), { status: 'to visit', originalIndex: i + data.visitedProfiles.length })))
                    ];
                    previousProfilesRef.current = currentProfiles;
                }
                setData(newState);
                setProfiles(newProfiles.profiles || {});
                setMessages(newMessages.messages || {});
            }
            catch (error) {
                console.error('failed to fetch data:', error);
            }
        });
        fetchData();
        const interval = setInterval(fetchData, 1000);
        return () => {
            clearInterval(interval);
        };
    }, [isOpen, data]);
    const getUsername = (url) => {
        try {
            const cleanUrl = url.replace(/\/$/, '');
            const username = cleanUrl.split('/').pop() || '';
            const decoded = decodeURIComponent(username);
            return decoded
                .replace(/-/g, ' ')
                .replace(/\b[a-f0-9]{6,}\b/g, '')
                .replace(/\b\d+\b/g, '')
                .replace(/\s+/g, ' ')
                .replace(/^\s+|\s+$/g, '')
                .replace(/\s*\([^)]*\)/g, '')
                .replace(/\s+$/, '');
        }
        catch (_a) {
            return url;
        }
    };
    const getName = (url) => {
        var _a;
        return ((_a = profiles[url]) === null || _a === void 0 ? void 0 : _a.name) || getUsername(url);
    };
    const formatTimestamp = (timestamp) => {
        return new Date(timestamp).toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });
    };
    const getMessageInfo = (url) => {
        const conversation = messages[url];
        if (!conversation)
            return null;
        return {
            count: conversation.messages.length,
            lastMessage: formatTimestamp(conversation.timestamp)
        };
    };
    const getActionPriority = (action) => {
        if (action === 'to review')
            return 0;
        if (action === 'scheduled')
            return 1;
        if (action === 'not done')
            return 2;
        return 3;
    };
    const getHighestPriorityAction = (actions) => {
        return Object.values(actions).reduce((highest, current) => {
            return getActionPriority(current) < getActionPriority(highest) ? current : highest;
        });
    };
    const sortProfiles = (profiles) => {
        return [...profiles].sort((a, b) => {
            var _a, _b;
            let comparison = 0;
            switch (sortField) {
                case 'index':
                    comparison = (a.originalIndex || 0) - (b.originalIndex || 0);
                    break;
                case 'name':
                    comparison = getName(a.profileUrl).localeCompare(getName(b.profileUrl)) ||
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    break;
                case 'timestamp':
                    comparison = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    break;
                case 'status':
                    comparison = (a.status || 'visited').localeCompare(b.status || 'visited') ||
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    break;
                case 'actions':
                    const aStatus = getHighestPriorityAction(a.actions);
                    const bStatus = getHighestPriorityAction(b.actions);
                    comparison = getActionPriority(aStatus) - getActionPriority(bStatus) ||
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    break;
                case 'messages':
                    const aCount = ((_a = getMessageInfo(a.profileUrl)) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    const bCount = ((_b = getMessageInfo(b.profileUrl)) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    comparison = bCount - aCount ||
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    break;
                default:
                    comparison = 0;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    };
    const allProfiles = data ? [
        ...data.visitedProfiles.map((p, i) => (Object.assign(Object.assign({}, p), { status: 'visited', originalIndex: i }))),
        ...data.toVisitProfiles.map((p, i) => (Object.assign(Object.assign({}, p), { status: 'to visit', originalIndex: i + data.visitedProfiles.length })))
    ] : [];
    const sortedProfiles = sortProfiles(allProfiles);
    const truncateText = (text, limit) => {
        return text.length > limit ? text.slice(0, limit) + '...' : text;
    };
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        }
        else {
            setSortField(field);
            setSortDirection('asc');
        }
    };
    const hasFieldUpdated = (profile, field) => {
        var _a, _b;
        const previous = previousProfilesRef.current.find(p => p.profileUrl === profile.profileUrl);
        if (!previous)
            return false;
        switch (field) {
            case 'timestamp':
                return previous.timestamp !== profile.timestamp;
            case 'actions':
                return JSON.stringify(previous.actions) !== JSON.stringify(profile.actions);
            case 'messages':
                return ((_a = getMessageInfo(previous.profileUrl)) === null || _a === void 0 ? void 0 : _a.count) !== ((_b = getMessageInfo(profile.profileUrl)) === null || _b === void 0 ? void 0 : _b.count);
            default:
                return false;
        }
    };
    return (<collapsible_1.Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <collapsible_1.CollapsibleTrigger className="flex items-center gap-2 w-full">
        <framer_motion_1.motion.h2 className="text-s font-semibold" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 0.3 }}>
          dashboard{sortedProfiles.length > 0 ? ` (${sortedProfiles.length})` : ''}
        </framer_motion_1.motion.h2>
        <lucide_react_1.ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}/>
      </collapsible_1.CollapsibleTrigger>
      <collapsible_1.CollapsibleContent className="mt-4">
        <div className="w-full max-w-7xl overflow-x-auto">
          <div className="flex items-center gap-4 mb-4">
            <button_1.Button variant="outline" size="sm" onClick={() => __awaiter(this, void 0, void 0, function* () {
            setIsCheckingMessages(true);
            try {
                const response = yield fetch('/api/messages/check', {
                    method: 'POST'
                });
                const result = yield response.json();
                if (!result.success) {
                    console.error('failed to check messages:', result.error);
                }
            }
            catch (error) {
                console.error('failed to check messages:', error);
            }
            finally {
                setIsCheckingMessages(false);
            }
        })} disabled={isCheckingMessages} className="text-sm">
              {isCheckingMessages ? (<>
                  <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  checking...
                </>) : ('check new messages')}
            </button_1.Button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    name
                    <lucide_react_1.ArrowUpDown className="h-4 w-4"/>
                  </div>
                </th>
                <th className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none" onClick={() => handleSort('timestamp')}>
                  <div className="flex items-center gap-1">
                    last update
                    <lucide_react_1.ArrowUpDown className="h-4 w-4"/>
                  </div>
                </th>
                <th className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    status
                    <lucide_react_1.ArrowUpDown className="h-4 w-4"/>
                  </div>
                </th>
                <th className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none" onClick={() => handleSort('actions')}>
                  <div className="flex items-center gap-1">
                    actions
                    <lucide_react_1.ArrowUpDown className="h-4 w-4"/>
                  </div>
                </th>
                <th className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none" onClick={() => handleSort('messages')}>
                  <div className="flex items-center gap-1">
                    messages
                    <lucide_react_1.ArrowUpDown className="h-4 w-4"/>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <framer_motion_1.AnimatePresence mode="popLayout">
                {sortedProfiles.map((profile) => {
            const messageInfo = getMessageInfo(profile.profileUrl);
            const isNew = !previousProfilesRef.current.find(p => p.profileUrl === profile.profileUrl);
            return (<framer_motion_1.motion.tr key={`${profile.profileUrl}-${profile.originalIndex}`} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900" initial={isNew ? { opacity: 0, y: 20 } : undefined} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }} layout>
                      <td className="p-2 w-[200px]">
                        <div className="truncate" title={getName(profile.profileUrl)}>
                          {truncateText(getName(profile.profileUrl), 25)}
                        </div>
                      </td>
                      <td className="p-2">
                        <framer_motion_1.motion.div animate={hasFieldUpdated(profile, 'timestamp')
                    ? {
                        scale: [1, 1.2, 1],
                        color: ['#000', '#f00', '#000'],
                    }
                    : {}} transition={{ duration: 0.5 }}>
                          {formatTimestamp(profile.timestamp)}
                        </framer_motion_1.motion.div>
                      </td>
                      <td className="p-2">{profile.status}</td>
                      <td className="p-2 w-[400px]">
                        <framer_motion_1.motion.div className="overflow-hidden" animate={hasFieldUpdated(profile, 'actions')
                    ? {
                        scale: [1, 1.05, 1],
                        color: ['#000', '#f00', '#000'],
                    }
                    : {}} transition={{ duration: 0.5 }}>
                          {Object.entries(profile.actions)
                    .sort(([, statusA], [, statusB]) => {
                    return getActionPriority(statusA) - getActionPriority(statusB);
                })
                    .map(([action, status]) => (<div key={action} className="truncate">
                                <span className={status === 'to review' ? 'bg-yellow-200 dark:bg-yellow-700/50' : ''}>
                                  {status}
                                </span>
                                {`: ${truncateText(action, 60)}`}
                              </div>))}
                        </framer_motion_1.motion.div>
                      </td>
                      <td className="p-2 min-w-[120px]">
                        {messageInfo && (<framer_motion_1.motion.div className="text-sm flex flex-col" animate={hasFieldUpdated(profile, 'messages')
                        ? {
                            scale: [1, 1.2, 1],
                            color: ['#000', '#f00', '#000'],
                        }
                        : {}} transition={{ duration: 0.5 }}>
                            <span>{messageInfo.count} msgs</span>
                            <span className="text-gray-500">{messageInfo.lastMessage}</span>
                          </framer_motion_1.motion.div>)}
                      </td>
                    </framer_motion_1.motion.tr>);
        })}
              </framer_motion_1.AnimatePresence>
            </tbody>
          </table>
        </div>
      </collapsible_1.CollapsibleContent>
    </collapsible_1.Collapsible>);
}
