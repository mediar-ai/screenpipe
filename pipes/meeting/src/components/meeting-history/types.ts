export interface Speaker {
    id: number;
    name: string;
  }
  
  export interface MeetingNote {
    id: string;
    text: string;
    timestamp: string; // ISO string
    editedAt?: string; // ISO string
    isInput: boolean;
    device: string;
  }
  
  export interface MeetingSegment {
    timestamp: string;
    transcription: string;
    deviceName: string;
    deviceType: string;
    speaker: Speaker;
    editedText?: string; // For tracking edited transcriptions
  }
  
  export interface Meeting {
    id: string;
    meetingStart: string;
    meetingEnd: string;
    humanName: string | null;
    aiName: string | null;
    aiSummary: string | null;
    participants: string | null;
    mergedWith?: number[];
    selectedDevices: Set<string>;
    deviceNames: Set<string>;
    segments: MeetingSegment[];
    notes: MeetingNote[];
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
    speaker: Speaker;
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
    aiSummary?: string | null;
    participants?: string | null;
    mergedWith?: number[];
    notes?: MeetingNote[];
  }