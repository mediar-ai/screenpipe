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

const HISTORY_FILE_PATH = path.join(process.cwd(), 'data', 'chat-history.json');

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
        }

        updated.forEach((updatedItem) => {
            const existingItemIndex = history.findIndex(item => item.id === updatedItem.id);
            if (existingItemIndex !== -1) {
                // Append messages to the existing history item
                history[existingItemIndex].messages.push(...updatedItem.messages);
            } else {
                // Add new history item
                history.push(updatedItem);
            }
        });

        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Failed to save history:', error);
    }
};

export const deleteHistoryItem = async (id: string): Promise<void> => {
    const history = await loadHistory();
    const updated = history.filter(item => item.id !== id);
    await saveHistory(updated);
};

export const listHistory = async (): Promise<{ id: string; title: string; timestamp: string }[]> => {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
            const history: HistoryItem[] = JSON.parse(data);
            return history.map(item => ({ id: item.id, title: item.title, timestamp: item.timestamp }));
        }
        return [];
    } catch (error) {
        console.error('Failed to list history:', error);
        return [];
    }
};
