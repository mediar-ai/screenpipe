import { Speaker } from "./speaker";

export interface MeetingSegment {
  timestamp: string;
  transcription: string;
  deviceName: string;
  deviceType: string;
  speaker: Speaker;
}
