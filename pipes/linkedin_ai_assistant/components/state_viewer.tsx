"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

interface Profile {
  name: string;
  title: string;
  headline: string;
}

type SortField = 'index' | 'name' | 'timestamp' | 'status' | 'actions' | 'messages';
type SortDirection = 'asc' | 'desc';

export default function StateViewer() {
  const [data, setData] = useState(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [messages, setMessages] = useState<Record<string, any>>({});
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const previousProfilesRef = useRef<any[]>([]);
  const [showTable, setShowTable] = useState(true);
  const [isCheckingMessages, setIsCheckingMessages] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!showTable) return;

      try {
        const [stateRes, profilesRes, messagesRes] = await Promise.all([
          fetch('/api/state'),
          fetch('/api/profiles'),
          fetch('/api/messages')
        ]);

        const [newState, newProfiles, newMessages] = await Promise.all([
          stateRes.json(),
          profilesRes.json(),
          messagesRes.json()
        ]);

        if (data) {
          const currentProfiles = [
            ...data.visitedProfiles.map((p, i) => ({ ...p, status: 'visited', originalIndex: i })),
            ...data.toVisitProfiles.map((p, i) => ({ ...p, status: 'to visit', originalIndex: i + data.visitedProfiles.length }))
          ];
          previousProfilesRef.current = currentProfiles;
        }
        
        setData(newState);
        setProfiles(newProfiles.profiles);
        setMessages(newMessages.messages);
      } catch (error) {
        console.error('failed to fetch data:', error);
      }
    };

    fetchData();
    const interval = showTable ? setInterval(fetchData, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showTable]);

  if (!data) {
    return <div className="p-4">loading...</div>;
  }

  const getUsername = (url: string) => {
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
    } catch (e) {
      return url;
    }
  };

  const getName = (url: string) => {
    return profiles[url]?.name || getUsername(url);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  };

  const getMessageInfo = (url: string) => {
    const conversation = messages[url];
    if (!conversation) return null;
    return {
      count: conversation.messages.length,
      lastMessage: formatTimestamp(conversation.timestamp)
    };
  };

  const getActionPriority = (action: string) => {
    if (action === 'to review') return 0;
    if (action === 'scheduled') return 1;
    if (action === 'not done') return 2;
    return 3;
  };

  const getHighestPriorityAction = (actions: Record<string, string>) => {
    return Object.values(actions).reduce((highest, current) => {
      return getActionPriority(current) < getActionPriority(highest) ? current : highest;
    });
  };

  const sortProfiles = (profiles: any[]) => {
    return [...profiles].sort((a, b) => {
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
          const aCount = getMessageInfo(a.profileUrl)?.count || 0;
          const bCount = getMessageInfo(b.profileUrl)?.count || 0;
          comparison = bCount - aCount ||
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const hasUpdates = (profile: any) => {
    return previousProfilesRef.current.find(p => {
      if (p.profileUrl !== profile.profileUrl) return false;
      return (
        p.timestamp !== profile.timestamp ||
        JSON.stringify(p.actions) !== JSON.stringify(profile.actions) ||
        getMessageInfo(p.profileUrl)?.count !== getMessageInfo(profile.profileUrl)?.count
      );
    });
  };

  const allProfiles = [
    ...data.visitedProfiles.map((p, i) => ({ ...p, status: 'visited', originalIndex: i })),
    ...data.toVisitProfiles.map((p, i) => ({ ...p, status: 'to visit', originalIndex: i + data.visitedProfiles.length }))
  ];

  const sortedProfiles = sortProfiles(allProfiles);

  const truncateText = (text: string, limit: number) => {
    return text.length > limit ? text.slice(0, limit) + '...' : text;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const hasToReviewAction = (actions: Record<string, string>) => {
    return Object.values(actions).some(status => status === 'to review');
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th 
      className="text-left p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-4 w-4" />
      </div>
    </th>
  );

  const MotionRow = motion.tr;

  const hasFieldUpdated = (profile: any, field: string) => {
    const previous = previousProfilesRef.current.find(p => p.profileUrl === profile.profileUrl);
    if (!previous) return false;

    switch (field) {
      case 'timestamp':
        return previous.timestamp !== profile.timestamp;
      case 'actions':
        return JSON.stringify(previous.actions) !== JSON.stringify(profile.actions);
      case 'messages':
        return getMessageInfo(previous.profileUrl)?.count !== getMessageInfo(profile.profileUrl)?.count;
      default:
        return false;
    }
  };

  return (
    <div className="w-full max-w-7xl overflow-x-auto">
      <div className="flex items-center gap-4 mb-4">
        <motion.h2 
          className="text-xl font-semibold"
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 0.3 }}
        >
          linkedin profiles status ({sortedProfiles.length})
        </motion.h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={showTable}
              onCheckedChange={setShowTable}
              aria-label="Toggle table visibility"
            />
            <span className="text-sm text-gray-500">
              {showTable ? 'hide' : 'show'} table
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setIsCheckingMessages(true);
              try {
                const response = await fetch('/api/messages/check', {
                  method: 'POST'
                });
                const result = await response.json();
                if (!result.success) {
                  console.error('failed to check messages:', result.error);
                }
              } catch (error) {
                console.error('failed to check messages:', error);
              } finally {
                setIsCheckingMessages(false);
              }
            }}
            disabled={isCheckingMessages}
            className="text-sm"
          >
            {isCheckingMessages ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                checking...
              </>
            ) : (
              'check new messages'
            )}
          </Button>
        </div>
      </div>

      {showTable && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <SortHeader field="name">name</SortHeader>
              <SortHeader field="timestamp">last update</SortHeader>
              <SortHeader field="status">status</SortHeader>
              <SortHeader field="actions">actions</SortHeader>
              <SortHeader field="messages">messages</SortHeader>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {sortedProfiles.map((profile) => {
                const messageInfo = getMessageInfo(profile.profileUrl);
                const isNew = !previousProfilesRef.current.find(p => p.profileUrl === profile.profileUrl);
                const hasProfileUpdates = hasUpdates(profile);

                return (
                  <MotionRow
                    key={`${profile.profileUrl}-${profile.originalIndex}`}
                    className="border-b hover:bg-gray-50 dark:hover:bg-gray-900"
                    initial={isNew ? { opacity: 0, y: 20 } : undefined}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    layout
                  >
                    <td className="p-2 w-[200px]">
                      <div className="truncate" title={getName(profile.profileUrl)}>
                        {truncateText(getName(profile.profileUrl), 25)}
                      </div>
                    </td>
                    <td className="p-2">
                      <motion.div
                        animate={
                          hasFieldUpdated(profile, 'timestamp')
                            ? {
                                scale: [1, 1.2, 1],
                                color: ['#000', '#f00', '#000'],
                              }
                            : {}
                        }
                        transition={{ duration: 0.5 }}
                      >
                        {formatTimestamp(profile.timestamp)}
                      </motion.div>
                    </td>
                    <td className="p-2">{profile.status}</td>
                    <td className="p-2 w-[400px]">
                      <motion.div 
                        className="overflow-hidden"
                        animate={
                          hasFieldUpdated(profile, 'actions')
                            ? {
                                scale: [1, 1.05, 1],
                                color: ['#000', '#f00', '#000'],
                              }
                            : {}
                        }
                        transition={{ duration: 0.5 }}
                      >
                        {Object.entries(profile.actions)
                          .sort(([_actionA, statusA], [_actionB, statusB]) => {
                            return getActionPriority(statusA) - getActionPriority(statusB);
                          })
                          .map(([action, status]) => (
                            <div key={action} className="truncate">
                              <span className={status === 'to review' ? 'bg-yellow-200 dark:bg-yellow-700/50' : ''}>
                                {status}
                              </span>
                              {`: ${truncateText(action, 60)}`}
                            </div>
                          ))}
                      </motion.div>
                    </td>
                    <td className="p-2 min-w-[120px]">
                      {messageInfo && (
                        <motion.div 
                          className="text-sm flex flex-col"
                          animate={
                            hasFieldUpdated(profile, 'messages')
                              ? {
                                  scale: [1, 1.2, 1],
                                  color: ['#000', '#f00', '#000'],
                                }
                              : {}
                          }
                          transition={{ duration: 0.5 }}
                        >
                          <span>{messageInfo.count} msgs</span>
                          <span className="text-gray-500">{messageInfo.lastMessage}</span>
                        </motion.div>
                      )}
                    </td>
                  </MotionRow>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      )}
    </div>
  );
}