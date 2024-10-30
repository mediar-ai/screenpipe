export interface SearchHistory {
  id: string;
  query: string;
  timestamp: string;
  searchParams: {
    q?: string;
    content_type: string;
    limit: number;
    offset: number;
    start_time: string;
    end_time: string;
    app_name?: string;
    window_name?: string;
    include_frames: boolean;
    min_length: number;
    max_length: number;
  };
  results: any[];
  messages: {
    id: string;
    type: 'search' | 'ai';
    content: string;
    timestamp: string;
  }[];
} 