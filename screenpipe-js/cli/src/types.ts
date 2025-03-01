export interface PipeOptions {
  name?: string;
  version?: string;
}

export interface CommandModule {
  command: string;
  description: string;
  action: (...args: any[]) => Promise<void>;
  options?: Array<{
    flags: string;
    description: string;
    required?: boolean;
  }>;
} 