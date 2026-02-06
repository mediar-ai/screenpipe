import { readTextFile, writeTextFile, remove, mkdir, readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export interface SessionMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface Session {
    id: string;
    messages: SessionMessage[];
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, any>;
}

export class SessionManager {
    private static instance: SessionManager;
    private sessionsDir: string | null = null;

    private constructor() { }

    public static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }

    private async ensureDir(): Promise<string> {
        if (this.sessionsDir) return this.sessionsDir;

        const baseDir = await appDataDir();
        this.sessionsDir = await join(baseDir, 'agent_sessions');

        try {
            await mkdir(this.sessionsDir, { recursive: true });
        } catch (error: any) {
            // Only ignore EEXIST (directory already exists), propagate other errors
            if (error?.code !== 'EEXIST') {
                console.error('Failed to create sessions directory:', error);
                throw new Error(`Failed to create sessions directory: ${error?.message || error}`);
            }
        }

        return this.sessionsDir;
    }

    public async saveSession(session: Session): Promise<void> {
        const dir = await this.ensureDir();
        const filePath = await join(dir, `${session.id}.json`);
        session.updatedAt = Date.now();
        await writeTextFile(filePath, JSON.stringify(session, null, 2));
    }

    public async loadSession(id: string): Promise<Session | null> {
        const dir = await this.ensureDir();
        const filePath = await join(dir, `${id}.json`);

        try {
            const content = await readTextFile(filePath);
            return JSON.parse(content) as Session;
        } catch (error) {
            return null;
        }
    }

    public async listSessions(): Promise<string[]> {
        const dir = await this.ensureDir();
        try {
            const entries = await readDir(dir);
            return entries
                .filter(e => e.name.endsWith('.json'))
                .map(e => e.name.replace('.json', ''));
        } catch (error) {
            return [];
        }
    }

    public async deleteSession(id: string): Promise<void> {
        const dir = await this.ensureDir();
        const filePath = await join(dir, `${id}.json`);
        try {
            await remove(filePath);
        } catch (error) {
            console.error(`Failed to delete session ${id}:`, error);
        }
    }
}
