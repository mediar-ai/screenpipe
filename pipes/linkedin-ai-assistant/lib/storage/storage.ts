import fs from 'fs/promises';
import path from 'path';
import { ProfileVisit, State, Message, ProfileStore, ProfileDetails, MessageStore } from './types';
import { getActiveBrowser, setupBrowser } from '../browser-setup';
import { ChromeSession } from '../chrome-session';

const STORAGE_DIR = path.join(process.cwd(), 'lib', 'storage');
console.log('storage directory:', STORAGE_DIR);

async function ensureStorageDir() {
    try {
        await fs.access(STORAGE_DIR);
    } catch {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
        console.log('created storage directory:', STORAGE_DIR);
    }
}

export async function loadState(): Promise<State> {
    await ensureStorageDir();
    let state: State | null = null;

    // Try file system first
    try {
        const statePath = path.join(STORAGE_DIR, 'state.json');
        const data = await fs.readFile(statePath, 'utf-8');
        state = JSON.parse(data);
    } catch (err) {
        console.log('failed to load state from fs:', err);
        
        // Try Chrome storage as fallback
        try {
            state = await loadFromChrome('linkedin_assistant_state');
            console.log('loaded state from chrome storage');
        } catch (err) {
            console.log('failed to load state from chrome:', err);
        }
    }

    // Return default state if both failed
    if (!state) {
        return { 
            visitedProfiles: [],
            toVisitProfiles: []
        };
    }

    return state;
}

export async function saveState(state: State) {
    try {
        // Save to file
        const statePath = path.join(STORAGE_DIR, 'state.json');
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
        
        // Save to Chrome
        await saveToChrome('linkedin_assistant_state', state);
        
        console.log('state saved to both locations');
    } catch (err) {
        console.error('error saving state:', err);
    }
}

export async function updateOrAddProfileVisit(state: State, newVisit: ProfileVisit) {
    const existingIndex = state.visitedProfiles.findIndex(
        visit => visit.profileUrl === newVisit.profileUrl
    );

    if (existingIndex !== -1) {
        const existing = state.visitedProfiles[existingIndex];
        state.visitedProfiles[existingIndex] = {
            ...existing,
            ...newVisit,
            actions: {
                ...existing.actions,
                ...newVisit.actions
            },
            timestamp: new Date().toISOString()
        };
        console.log('updated existing profile record');
    } else {
        state.visitedProfiles.push(newVisit);
        console.log('added new profile record');
    }

    await saveState(state);
}

export async function loadMessages(): Promise<MessageStore> {
    await ensureStorageDir();
    let messageStore: MessageStore;

    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'messages.json'), 'utf-8');
        messageStore = JSON.parse(data);
    } catch {
        try {
            messageStore = await loadFromChrome('linkedin_assistant_messages');
        } catch {
            messageStore = { messages: {} };
        }
    }
    return messageStore;
}

export async function saveMessages(profileUrl: string, newMessages: Message[]) {
    // Load both message store and state
    const messageStore = await loadMessages();
    const state = await loadState();
    
    const existingMessages = messageStore.messages[profileUrl]?.messages || [];
    
    // filter out duplicates based on text and timestamp
    const uniqueNewMessages = newMessages.filter(newMsg => 
        !existingMessages.some(existingMsg => 
            existingMsg.text === newMsg.text && 
            existingMsg.timestamp === newMsg.timestamp
        )
    );

    // Update message store
    messageStore.messages[profileUrl] = {
        timestamp: new Date().toISOString(),
        messages: [...existingMessages, ...uniqueNewMessages]
    };
    
    // Update state timestamp for the profile
    const profileIndex = state.visitedProfiles.findIndex(p => p.profileUrl === profileUrl);
    if (profileIndex !== -1) {
        state.visitedProfiles[profileIndex].timestamp = new Date().toISOString();
        await saveState(state);
    }
    
    // Save messages
    await fs.writeFile(
        path.join(STORAGE_DIR, 'messages.json'),
        JSON.stringify(messageStore, null, 2)
    );
    console.log(`saved ${uniqueNewMessages.length} new messages for profile ${profileUrl}`);
}

export async function scheduleMessage(state: State, profileUrl: string, text: string, condition: string) {
    const existingProfile = state.visitedProfiles.find(visit => visit.profileUrl === profileUrl);
    if (!existingProfile) {
        throw new Error('cannot schedule message for non-existing profile');
    }

    existingProfile.scheduledMessages = [
        ...(existingProfile.scheduledMessages || []),
        {
            text,
            condition,
            timestamp: new Date().toISOString()
        }
    ];

    await saveState(state);
    console.log('scheduled message for profile');
}

export async function loadProfiles(): Promise<ProfileStore> {
    let profiles: ProfileStore;
    
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'profiles.json'), 'utf-8');
        profiles = JSON.parse(data);
    } catch {
        try {
            profiles = await loadFromChrome('linkedin_assistant_profiles');
        } catch {
            profiles = { profiles: {} };
        }
    }
    return profiles;
}

export async function saveProfile(profileUrl: string, details: ProfileDetails) {
    const profiles = await loadProfiles();
    profiles.profiles[profileUrl] = details;
    
    try {
        await fs.writeFile(path.join(STORAGE_DIR, 'profiles.json'), JSON.stringify(profiles, null, 2));
        await saveToChrome('linkedin_assistant_profiles', profiles);
        console.log('saved profile details to both locations');
    } catch (err) {
        console.error('error saving profile:', err);
    }
}

export async function updateMultipleProfileVisits(state: State, newVisits: ProfileVisit[]) {
    state.visitedProfiles = state.visitedProfiles || [];
    state.toVisitProfiles = state.toVisitProfiles || [];

    let alreadyVisitedCount = 0;
    let alreadyQueuedCount = 0;
    let newlyQueuedCount = 0;

    for (const newVisit of newVisits) {
        const alreadyVisited = state.visitedProfiles.some(
            visit => visit.profileUrl === newVisit.profileUrl
        );
        
        const alreadyQueued = state.toVisitProfiles.some(
            visit => visit.profileUrl === newVisit.profileUrl
        );

        if (alreadyVisited) {
            alreadyVisitedCount++;
        } else if (alreadyQueued) {
            alreadyQueuedCount++;
        } else {
            state.toVisitProfiles.push(newVisit);
            newlyQueuedCount++;
        }
    }

    await saveState(state);
    
    const summary = {
        total: newVisits.length,
        alreadyVisited: alreadyVisitedCount,
        alreadyQueued: alreadyQueuedCount,
        newlyQueued: newlyQueuedCount,
        currentQueueSize: state.toVisitProfiles.length,
        totalVisited: state.visitedProfiles.length
    };
    
    console.log('profile queue update:', summary);
    return summary;
} 

export interface Connection {
    profileUrl: string;
    status: 'pending' | 'accepted' | 'declined' | 'email_required' | 'invalid';
    timestamp: string;
}

interface ConnectionsStore {
    nextHarvestTime?: string;
    connections: Record<string, Connection>;
    harvestingStatus: 'stopped' | 'running' | 'cooldown';
    statusMessage?: string; 
    connectionsSent: number;
    lastRefreshDuration?: number;  // in milliseconds
    averageProfileCheckDuration?: number;  // in milliseconds
    shouldStopRefresh?: boolean;
    stopRequested: boolean;
    restrictionInfo?: {
        isRestricted: boolean;
        endDate?: string;
        reason?: string;
    };
    isWithdrawing: boolean;
    withdrawStatus?: WithdrawStatus;
    heartbeat?: {
        lastBeat: string;  // ISO timestamp
        processId: string; // unique ID for each harvest run
    }
}

interface WithdrawStatus {
    isWithdrawing: boolean;
    reason?: string;
    timestamp?: string;
}

// Define default values
const DEFAULT_CONNECTION_STORE: ConnectionsStore = {
  connections: {},
  connectionsSent: 0,
  harvestingStatus: 'stopped',
  stopRequested: false,
  nextHarvestTime: '',
  lastRefreshDuration: 0,
  averageProfileCheckDuration: 0,
  isWithdrawing: false
};

export async function loadConnections(): Promise<ConnectionsStore> {
  await ensureStorageDir();
  let connectionsStore: ConnectionsStore;

  // Try filesystem first
  try {
    const data = await fs.readFile(path.join(STORAGE_DIR, 'connections.json'), 'utf-8');
    connectionsStore = {
      ...DEFAULT_CONNECTION_STORE,  // Start with defaults
      ...JSON.parse(data)          // Override with stored values
    };
    // If found in fs but not in chrome, save to chrome
    await saveToChrome('linkedin_assistant_connections', connectionsStore);
  } catch {
    // Try chrome if fs fails
    try {
      connectionsStore = {
        ...DEFAULT_CONNECTION_STORE,
        ...await loadFromChrome('linkedin_assistant_connections')
      };
      // If found in chrome but not in fs, save to fs
      await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
      );
    } catch {
      connectionsStore = { ...DEFAULT_CONNECTION_STORE };
    }
  }

  // Ensure connections object exists and all connections have valid status
  connectionsStore.connections = connectionsStore.connections || {};
  Object.entries(connectionsStore.connections).forEach(([url, connection]) => {
    if (!connection || !connection.status) {
      connectionsStore.connections[url] = {
        profileUrl: url,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
    }
  });

  return connectionsStore;
}

export async function saveConnection(connection: Connection) {
    const connectionsStore = await loadConnections();
    connectionsStore.connections[connection.profileUrl] = connection;

    try {
        await fs.writeFile(
            path.join(STORAGE_DIR, 'connections.json'),
            JSON.stringify(connectionsStore, null, 2)
        );
        await saveToChrome('linkedin_assistant_connections', connectionsStore);
        console.log(`saved connection to both locations: ${connection.profileUrl}`);
    } catch (err) {
        console.error('error saving connection:', err);
    }
}

export async function saveNextHarvestTime(timestamp: string) {
    const connectionsStore = await loadConnections();
    connectionsStore.nextHarvestTime = timestamp;
    
    try {
        await fs.writeFile(
            path.join(STORAGE_DIR, 'connections.json'),
            JSON.stringify(connectionsStore, null, 2)
        );
        await saveToChrome('linkedin_assistant_connections', connectionsStore);
        console.log(`saved next harvest time to both locations: ${timestamp}`);
    } catch (err) {
        console.error('error saving harvest time:', err);
    }
}

export async function saveHarvestingState(
  status: 'stopped' | 'running' | 'cooldown',
  statusMessage?: string
) {
    const connectionsStore = await loadConnections();
    connectionsStore.harvestingStatus = status;
    connectionsStore.statusMessage = statusMessage; // Save the status message
    
    try {
        await fs.writeFile(
            path.join(STORAGE_DIR, 'connections.json'),
            JSON.stringify(connectionsStore, null, 2)
        );
        await saveToChrome('linkedin_assistant_connections', connectionsStore);
        console.log(`saved harvesting status to both locations: ${status} (${statusMessage || 'no message'})`);
    } catch (err) {
        console.error('error saving harvesting state:', err);
    }
}

export async function updateConnectionsSent(connectionsSent: number) {
    const connectionsStore = await loadConnections();
    connectionsStore.connectionsSent = connectionsSent;

    try {
        await fs.writeFile(
            path.join(STORAGE_DIR, 'connections.json'),
            JSON.stringify(connectionsStore, null, 2)
        );
        await saveToChrome('linkedin_assistant_connections', connectionsStore);
        console.log(`updated connections sent count to ${connectionsSent} in both locations`);
    } catch (err) {
        console.error('error updating connections sent:', err);
    }
}

export async function saveRefreshStats(totalDuration: number, profileCount: number) {
    const connectionsStore = await loadConnections();
    connectionsStore.lastRefreshDuration = totalDuration;
    connectionsStore.averageProfileCheckDuration = profileCount > 0 ? totalDuration / profileCount : undefined;

    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
    );
    console.log(`saved refresh stats: ${totalDuration}ms for ${profileCount} profiles`);
}

export async function setShouldStopRefresh(value: boolean) {
    const store = await loadConnections();
    store.shouldStopRefresh = value;
    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(store, null, 2)
    );
    console.log('saved shouldStopRefresh:', value);
}

export async function getShouldStopRefresh(): Promise<boolean> {
    const store = await loadConnections();
    return store.shouldStopRefresh || false;
}

export async function setStopRequested(value: boolean) {
    const store = await loadConnections();
    store.stopRequested = value;
    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(store, null, 2)
    );
    console.log('saved stopRequested:', value);
}

export async function isStopRequested(): Promise<boolean> {
    const store = await loadConnections();
    return store.stopRequested || false;
} 

export async function saveToChrome(key: string, data: unknown) {
    try {
        // First try to get existing browser
        let pages;
        const { browser } = getActiveBrowser();
        if (!browser) {
            console.log('no browser found, attempting to set up...');
            const { browser: newBrowser } = await setupBrowser();
            if (!newBrowser) {
                console.log('cannot save to chrome: failed to set up browser');
                return;
            }
            pages = await newBrowser.pages();
        } else {
            pages = await browser.pages();
        }
        // console.log('found pages:', pages.length);
        
        // Find LinkedIn tab
        let linkedInPage = null;
        for (const page of pages) {
            const url = await page.url();
            // console.log('checking page url:', url);
            if (url.includes('linkedin.com')) {
                linkedInPage = page;
                break;
            }
        }
        
        if (!linkedInPage) {
            console.log('cannot save to chrome: no linkedin page found');
            return;
        }

        await linkedInPage.evaluate((key: string, data: unknown) => {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        }, key, data);
        
        // console.log('successfully saved to chrome storage:', key);
    } catch (err) {
        // console.log('failed to save to chrome storage:', {error: err, key});
    }
}

export async function loadFromChrome(key: string) {
    const session = ChromeSession.getInstance();
    const page = session.getActivePage();
    if (!page) {
        console.log('cannot load from chrome: no active page in session');
        return null;
    }
    
    try {
        console.log('attempting to load', key, 'from chrome storage');
        const data = await page.evaluate((key: string) => {
            console.log('in page context, loading:', key);
            const value = localStorage.getItem(key);
            console.log('loaded value:', value);
            return value;
        }, key);
        
        console.log('chrome storage load result:', data ? 'found' : 'not found');
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.log('failed to load from chrome storage:', err);
        return null;
    }
}

export async function setWithdrawingStatus(isWithdrawing: boolean, details?: { reason: string; timestamp: string }) {
    const store = await loadConnections();
    store.withdrawStatus = {
        isWithdrawing,
        ...(details || {})
    };
    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(store, null, 2)
    );
    console.log('saved withdrawal status:', { isWithdrawing, ...details });
}

export async function saveRestrictionInfo(info: {
    isRestricted: boolean;
    endDate?: string;
    reason?: string;
}) {
    const store = await loadConnections();
    store.restrictionInfo = info;
    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(store, null, 2)
    );
    await saveToChrome('linkedin_assistant_connections', store);
    console.log('saved restriction info:', info);
}

// Add this interface
interface CronLog {
  timestamp: string;
  action: string;
  result: string;
  nextHarvestTime?: string;
}

// Add these functions
export async function saveCronLog(log: CronLog) {
  const logPath = path.join(STORAGE_DIR, 'cron-logs.json');
  let logs: CronLog[] = [];

  try {
    const data = await fs.readFile(logPath, 'utf-8');
    logs = JSON.parse(data);
  } catch {
    // File doesn't exist yet, start with empty array
  }

  // Add new log and keep last 100 entries
  logs.unshift(log);
  logs = logs.slice(0, 100);

  await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
  console.log('saved cron log:', log);
}

export async function loadCronLogs(): Promise<CronLog[]> {
  const logPath = path.join(STORAGE_DIR, 'cron-logs.json');
  try {
    const data = await fs.readFile(logPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function updateHeartbeat(processId: string) {
  const store = await loadConnections();
  store.heartbeat = {
    lastBeat: new Date().toISOString(),
    processId
  };
  console.log('updating heartbeat:', { 
    processId, 
    timestamp: store.heartbeat.lastBeat 
  });
  await fs.writeFile(
    path.join(STORAGE_DIR, 'connections.json'),
    JSON.stringify(store, null, 2)
  );
}

export async function isHarvestingAlive(): Promise<boolean> {
  const store = await loadConnections();
  if (!store.heartbeat) {
    // console.log('no heartbeat found');
    return false;
  }

  const lastBeat = new Date(store.heartbeat.lastBeat);
  const now = new Date();
  
  // If no heartbeat in last 30 seconds, consider process dead
  const isAlive = now.getTime() - lastBeat.getTime() < 30_000;
//   console.log('harvest heartbeat check:', { 
//     lastBeat: store.heartbeat.lastBeat,
//     processId: store.heartbeat.processId,
//     isAlive,
//     timeSinceLastBeat: `${Math.floor((now.getTime() - lastBeat.getTime()) / 1000)}s`
//   });
  
  return isAlive;
}

export interface HarvestStatus {
  connectionsSent: number;
  weeklyLimitReached: boolean;
  dailyLimitReached: boolean;
  nextHarvestTime?: string;
  stopped?: boolean;
  harvestingStatus: 'stopped' | 'running' | 'cooldown';
  statusMessage?: string; // Add this field
}

export async function getHarvestingStatus(): Promise<HarvestStatus> {
  const store = await loadConnections();
  const isAlive = await isHarvestingAlive();

  if (store.harvestingStatus === 'running' && !isAlive) {
    console.log('detected dead harvest process, resetting state');
    await saveHarvestingState('stopped', 'harvest process died unexpectedly');
    return {
      harvestingStatus: 'stopped',
      connectionsSent: store.connectionsSent || 0,
      weeklyLimitReached: false,
      dailyLimitReached: false,
      nextHarvestTime: store.nextHarvestTime,
      statusMessage: 'harvest process died unexpectedly'
    };
  }

  return {
    harvestingStatus: store.harvestingStatus,
    connectionsSent: store.connectionsSent || 0,
    weeklyLimitReached: false,
    dailyLimitReached: false,
    nextHarvestTime: store.nextHarvestTime,
    statusMessage: store.statusMessage
  };
}
