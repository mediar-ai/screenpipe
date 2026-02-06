import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_PROMPT = `
Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK
`.trim();

const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

export class HeartbeatService {
    private static instance: HeartbeatService;
    private intervalMs: number = DEFAULT_INTERVAL_MS;
    private timer: NodeJS.Timeout | null = null;
    private onHeartbeatExecute: ((prompt: string) => Promise<string>) | null = null;
    private heartbeatFile: string | null = null;

    private constructor() { }

    public static getInstance(): HeartbeatService {
        if (!HeartbeatService.instance) {
            HeartbeatService.instance = new HeartbeatService();
        }
        return HeartbeatService.instance;
    }

    private async ensureFile(): Promise<string> {
        if (this.heartbeatFile) return this.heartbeatFile;
        const baseDir = await appDataDir();
        this.heartbeatFile = await join(baseDir, 'HEARTBEAT.md');
        return this.heartbeatFile;
    }

    public async start(executeCallback: (prompt: string) => Promise<string>, intervalMs?: number): Promise<void> {
        this.onHeartbeatExecute = executeCallback;
        if (intervalMs) this.intervalMs = intervalMs;

        this.stop();
        this.scheduleNext();
        console.log(`Heartbeat service started (every ${this.intervalMs}ms)`);
    }

    private scheduleNext(): void {
        this.timer = setTimeout(async () => {
            await this.tick();
            if (this.timer) this.scheduleNext();
        }, this.intervalMs);
    }

    public stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private async tick(): Promise<void> {
        const file = await this.ensureFile();

        try {
            if (!(await exists(file))) {
                return;
            }

            const content = await readTextFile(file);
            if (this.isHeartbeatEmpty(content)) {
                return;
            }

            console.log('Heartbeat: checking for tasks...');
            if (this.onHeartbeatExecute) {
                const response = await this.onHeartbeatExecute(HEARTBEAT_PROMPT);
                if (response.includes(HEARTBEAT_OK_TOKEN)) {
                    console.log('Heartbeat: OK (no action needed)');
                } else {
                    console.log('Heartbeat: completed task');
                }
            }
        } catch (error) {
            console.error('Heartbeat error:', error);
        }
    }

    private isHeartbeatEmpty(content: string): boolean {
        if (!content.trim()) return true;

        const emptyCheckboxPatterns = ['- [ ]', '* [ ]'];
        const completedCheckboxPrefixes = ['- [x]', '* [x]', '- [X]', '* [X]'];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--') ||
                emptyCheckboxPatterns.includes(trimmed) ||
                completedCheckboxPrefixes.some(p => trimmed.startsWith(p))) {
                continue;
            }
            return false;
        }

        return true;
    }

    public async triggerNow(): Promise<string | null> {
        if (this.onHeartbeatExecute) {
            return await this.onHeartbeatExecute(HEARTBEAT_PROMPT);
        }
        return null;
    }
}
