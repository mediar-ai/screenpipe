export interface ScreenPipeOCRContent {
    frame_id: number;
    text: string;
    timestamp: string;
    file_path: string;
    offset_index: number;
    app_name: string;
    window_name: string;
    tags?: string[];
    frame?: string;
}

export interface ScreenPipeSearchResult {
    type: 'OCR';
    content: ScreenPipeOCRContent;
}

export interface ScreenPipeResponse {
    data: ScreenPipeSearchResult[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}
