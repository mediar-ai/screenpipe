import fs from 'fs/promises';
import path from 'path';
import { ProfileVisit, State, Message, ProfileStore, ProfileDetails, MessageStore } from './types';

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
    try {
        const statePath = path.join(STORAGE_DIR, 'state.json');
        // console.log('attempting to load state from:', statePath);
        
        const data = await fs.readFile(statePath, 'utf-8');
        // console.log('raw state data:', data.slice(0, 200) + '...');
        
        const state = JSON.parse(data);
        console.log('parsed state:', {
            visitedProfilesCount: state.visitedProfiles?.length || 0,
            toVisitProfilesCount: state.toVisitProfiles?.length || 0
        });
        
        return {
            visitedProfiles: state.visitedProfiles || [],
            toVisitProfiles: state.toVisitProfiles || []
        };
    } catch (err) {
        console.log('failed to load state:', err);
        return { 
            visitedProfiles: [],
            toVisitProfiles: []
        };
    }
}

export async function saveState(state: State) {
    const statePath = path.join(STORAGE_DIR, 'state.json');
    console.log('saving state to:', statePath, {
        visitedProfilesCount: state.visitedProfiles?.length || 0,
        toVisitProfilesCount: state.toVisitProfiles?.length || 0
    });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
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
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'messages.json'), 'utf-8');
        return JSON.parse(data);
    } catch {
        return { messages: {} };
    }
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
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'profiles.json'), 'utf-8');
        return JSON.parse(data);
    } catch {
        return { profiles: {} };
    }
}

export async function saveProfile(profileUrl: string, details: ProfileDetails) {
    const profiles = await loadProfiles();
    profiles.profiles[profileUrl] = details;
    await fs.writeFile(path.join(STORAGE_DIR, 'profiles.json'), JSON.stringify(profiles, null, 2));
    console.log('saved profile details');
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
    status: 'pending' | 'accepted' | 'declined' | 'email_required' | 'cooldown';
    timestamp: string;
    cooldownUntil?: string;
}

interface ConnectionsStore {
    nextHarvestTime?: string;
    connections: Record<string, Connection>;
    isHarvesting?: boolean;
    connectionsSent: number;
}

export async function loadConnections(): Promise<ConnectionsStore> {
    await ensureStorageDir();
    try {
        const data = await fs.readFile(path.join(STORAGE_DIR, 'connections.json'), 'utf-8');
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // File does not exist, safe to return default empty object
            return {
                connections: {},
                connectionsSent: 0,
                isHarvesting: false,
            };
        } else {
            // Parsing error or other read error, do not overwrite existing data
            console.error('Failed to read or parse connections.json:', error);
            throw new Error('Could not load connections data.');
        }
    }
}

export async function saveConnection(connection: Connection) {
    const connectionsStore = await loadConnections();
    connectionsStore.connections[connection.profileUrl] = connection;

    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
    );
    console.log(`saved connection to ${connection.profileUrl} with status ${connection.status}`);
}

export async function saveNextHarvestTime(timestamp: string) {
    const connectionsStore = await loadConnections();
    connectionsStore.nextHarvestTime = timestamp;
    
    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
    );
    console.log(`saved next harvest time: ${timestamp}`);
}

export async function saveHarvestingState(isHarvesting: boolean) {
    let connectionsStore: ConnectionsStore;
    try {
        connectionsStore = await loadConnections();
    } catch (error) {
        console.error('Failed to load connections for saving harvesting state:', error);
        throw new Error('Cannot save harvesting state because connections data could not be loaded.');
    }

    connectionsStore.isHarvesting = isHarvesting;

    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
    );
    console.log(`saved harvesting state: ${isHarvesting}`);
}

export async function updateConnectionsSent(connectionsSent: number) {
    const connectionsStore = await loadConnections();
    connectionsStore.connectionsSent = connectionsSent;

    await fs.writeFile(
        path.join(STORAGE_DIR, 'connections.json'),
        JSON.stringify(connectionsStore, null, 2)
    );
    console.log(`Updated connections sent count to ${connectionsSent}`);
} 