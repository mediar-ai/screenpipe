export type AudioSample = {
  path: string;
  transcript: string;
  startTime?: number;
  endTime?: number;
};

export interface Speaker {
  id: number;
  name: string;
  metadata?: {
    audioSamples: AudioSample[];
  };
}
