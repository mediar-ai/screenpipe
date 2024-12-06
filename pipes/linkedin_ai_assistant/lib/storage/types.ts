export interface ProfileDetails {
    name?: string;
    title?: string;
    headline?: string;
    location?: string;
    allText?: string[];
}

export interface ProfileElement {
    text: string | undefined;
    href: string | null;
    class: string;
    parentClass: string | null;
    isClickable: boolean;
}

export interface ProfileVisit {
    timestamp: string;
    profileUrl: string;
    actions: Record<string, string>;
    scheduledMessages?: ScheduledMessage[];
}

export interface State {
    visitedProfiles: ProfileVisit[];
    toVisitProfiles: ProfileVisit[];
}

export interface Message {
    text: string;
    timestamp?: string;
    sender?: string;
}

export interface ScheduledMessage {
    text: string;
    condition: string;
    timestamp: string;
}

export interface ProfileStore {
    profiles: Record<string, ProfileDetails>;
}

export interface MessageStore {
    messages: Record<string, {
        timestamp: string;
        messages: Message[];
    }>;
}