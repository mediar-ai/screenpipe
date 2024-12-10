export type AudioSample = {
  path: string;
  transcript: string;
};

export interface Speaker {
  id: number;
  name: string;
  metadata?: {
    audioSamples: AudioSample[];
  };
}
