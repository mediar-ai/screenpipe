"use server";

import fs from 'fs';
import path from 'path';

export interface HistoryItem {
    id: string;
    title: string;
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
        type: 'user' | 'ai';
        content: string;
        timestamp: string;
    }[];
}


const HISTORY_FILE_PATH = path.join(process.env.SCREENPIPE_DIR || process.cwd(), 'chat-history.json');

export const loadHistory = async (historyId?: string): Promise<HistoryItem[]> => {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
            const history: HistoryItem[] = JSON.parse(data);
            if (historyId) {
                return history.filter(item => item.id === historyId);
            }
            return history;
        }
        return [];
    } catch (error) {
        console.error('Failed to load history:', error);
        return [];
    }
};
export const saveHistory = async (updated: HistoryItem[]): Promise<void> => {
    try {
        let history: HistoryItem[] = [];
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
            history = JSON.parse(data);
        } else {
            const dir = path.dirname(HISTORY_FILE_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify([]));
        }

        updated.forEach((updatedItem) => {
            const existingItemIndex = history.findIndex(item => item.id === updatedItem.id);
            if (existingItemIndex !== -1) {
                history[existingItemIndex].messages.push(...updatedItem.messages);
            } else {
                history.push(updatedItem);
            }
        });

        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Failed to save history:', error);
    }
};

export const deleteHistoryItem = async (id: string): Promise<void> => {
    try {
        const history = await loadHistory();
        const updated = history.filter(item => item.id !== id);
        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(updated, null, 2));
    } catch (error) {
        console.error('Failed to delete history item:', error);
    }
};
export const listHistory = async (): Promise<HistoryItem[]> => {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
            const history: HistoryItem[] = JSON.parse(data);
            return history;
        }
        return [];
    } catch (error) {
        console.error('Failed to list history:', error);
        return [];
    }
};

