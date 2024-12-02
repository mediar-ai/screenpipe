export interface Speaker {
  id: number;
  name: string;
  metadata?: {
    audioPaths: string[];
  };
}
