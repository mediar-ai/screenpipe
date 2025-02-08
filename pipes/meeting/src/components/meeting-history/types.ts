export interface Note {
    id: string;
    text: string;
    timestamp: Date;
    editedAt?: Date;
    isAiGenerated?: boolean;
    isInput?: boolean;
    device?: string;
  }
  export interface TranscriptionChunk {
    timestamp: string
    text: string
    isInput: boolean
    device: string
    speaker?: string
    id: number
    deviceName?: string
    deviceType?: string
  }
  
  export type ServiceStatus = 'available' | 'forbidden' | 'unavailable' | 'no_subscription'
  export interface MeetingNote {
    id: string;
    text: string;
    timestamp: string; // ISO string
    editedAt?: string; // ISO string
  }
  
  export interface MeetingSegment {
    timestamp: string;
    transcription: string;
    deviceName: string;
    deviceType?: string;
    speaker: string;
    editedText?: string;
  }
  
  export interface Meeting {
    id: string;
    meetingStart: string;
    meetingEnd: string;
    humanName: string | null;
    aiName: string | null;
    agenda: string | null;
    aiSummary: string | null;
    participants: string | null;
    mergedWith?: number[];
    selectedDevices: Set<string>;
    deviceNames: Set<string>;
    segments: MeetingSegment[];
    notes: MeetingNote[];
    participants_invited?: string[];
    recurrence?: string;
    guestCount?: number;
    confirmedCount?: number;
    organizer?: string;
    aiPrep?: MeetingPrep;
  }
  
  export interface AudioContent {
    chunkId: number;
    transcription: string;
    timestamp: string;
    filePath: string;
    offsetIndex: number;
    tags: string[];
    deviceName: string;
    deviceType: string;
    speaker: string;
  }
  
  export interface AudioTranscription {
    type: "Audio";
    content: AudioContent;
  }
  
  export interface LiveMeeting {
    isRecording: boolean;
    startTime: string;
    transcription: string;
  }
  
  // Type for partial updates to avoid loading full meeting data
  export interface MeetingUpdate {
    id: string;  // Changed from number to string
    humanName?: string | null;
    aiName?: string | null;
    agenda?: string | null;
    aiSummary?: string | null;
    participants?: string | null;
    mergedWith?: number[];
    notes?: MeetingNote[];
  }

  export interface PersonContext {
    personality: string;
    communicationStyle: string;
    pastDecisions: string[];
    strengths: string[];
    challenges: string[];
  }
  
  export interface MeetingPrep {
    previousContext: {
      lastInteraction: string;
      personContext: Record<string, PersonContext>;
      agreedNextSteps: string[];
    };
    suggestedPrep: {
      reviewPoints: string[];
      discussionTopics: string[];
      meetingTips: string[];
    };
  }