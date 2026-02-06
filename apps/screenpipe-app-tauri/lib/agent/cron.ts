import { v4 as uuidv4 } from 'uuid';
import { readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export type CronScheduleKind = 'at' | 'every';

export interface CronSchedule {
    kind: CronScheduleKind;
    at_ms?: number;
    every_ms?: number;
}

export interface CronJob {
    id: string;
    name: string;
    enabled: boolean;
    schedule: CronSchedule;
    task: string;
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error';
    lastError?: string;
    createdAtMs: number;
    updatedAtMs: number;
    deleteAfterRun: boolean;
}

export class CronService {
    private static instance: CronService;
    private jobs: CronJob[] = [];
    private cronFile: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private onJobExecute: ((job: CronJob) => Promise<void>) | null = null;

    private constructor() { }

    public static getInstance(): CronService {
        if (!CronService.instance) {
            CronService.instance = new CronService();
        }
        return CronService.instance;
    }

    private async ensureFile(): Promise<string> {
        if (this.cronFile) return this.cronFile;
        const baseDir = await appDataDir();
        const dir = await join(baseDir, 'agent_config');
        await mkdir(dir, { recursive: true });
        this.cronFile = await join(dir, 'cron_jobs.json');
        return this.cronFile;
    }

    public async start(executeCallback: (job: CronJob) => Promise<void>): Promise<void> {
        this.onJobExecute = executeCallback;
        await this.loadJobs();
        this.recomputeNextRuns();
        await this.saveJobs();
        this.armTimer();
        console.log(`Cron service started with ${this.jobs.length} jobs`);
    }

    public stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private async loadJobs(): Promise<void> {
        const file = await this.ensureFile();
        if (!file) return;
        try {
            const content = await readTextFile(file);
            this.jobs = JSON.parse(content);
        } catch (error) {
            this.jobs = [];
        }
    }

    private async saveJobs(): Promise<void> {
        const file = await this.ensureFile();
        await writeTextFile(file, JSON.stringify(this.jobs, null, 2));
    }

    private recomputeNextRuns(): void {
        const now = Date.now();
        for (const job of this.jobs) {
            if (job.enabled && (!job.nextRunAtMs || job.nextRunAtMs < now)) {
                job.nextRunAtMs = this.computeNextRun(job.schedule, now);
            }
        }
    }

    private computeNextRun(schedule: CronSchedule, now: number): number | undefined {
        if (schedule.kind === 'at') {
            return schedule.at_ms && schedule.at_ms > now ? schedule.at_ms : undefined;
        }
        if (schedule.kind === 'every') {
            return schedule.every_ms ? now + schedule.every_ms : undefined;
        }
        return undefined;
    }

    private armTimer(): void {
        if (this.timer) clearTimeout(this.timer);

        const nextWake = this.getNextWakeMs();
        if (!nextWake) return;

        const delay = Math.max(0, nextWake - Date.now());
        this.timer = setTimeout(() => this.onTimer(), delay);
    }

    private getNextWakeMs(): number | undefined {
        const times = this.jobs
            .filter(j => j.enabled && j.nextRunAtMs)
            .map(j => j.nextRunAtMs as number);
        return times.length > 0 ? Math.min(...times) : undefined;
    }

    private async onTimer(): Promise<void> {
        const now = Date.now();
        const dueJobs = this.jobs.filter(j => j.enabled && j.nextRunAtMs && now >= j.nextRunAtMs);

        for (const job of dueJobs) {
            await this.executeJob(job);
        }

        await this.saveJobs();
        this.armTimer();
    }

    private async executeJob(job: CronJob): Promise<void> {
        const start = Date.now();
        console.log(`Executing cron job: ${job.name} (${job.id})`);

        try {
            if (this.onJobExecute) {
                await this.onJobExecute(job);
            }
            job.lastStatus = 'ok';
            job.lastError = undefined;
        } catch (error: any) {
            job.lastStatus = 'error';
            job.lastError = error.message;
        }

        job.lastRunAtMs = start;
        job.updatedAtMs = Date.now();

        if (job.schedule.kind === 'at') {
            if (job.deleteAfterRun) {
                this.jobs = this.jobs.filter(j => j.id !== job.id);
            } else {
                job.enabled = false;
                job.nextRunAtMs = undefined;
            }
        } else {
            job.nextRunAtMs = this.computeNextRun(job.schedule, Date.now());
        }
    }

    public async addJob(name: string, schedule: CronSchedule, task: string, deleteAfterRun = false): Promise<CronJob> {
        const now = Date.now();
        const job: CronJob = {
            id: uuidv4().slice(0, 8),
            name,
            enabled: true,
            schedule,
            task,
            nextRunAtMs: this.computeNextRun(schedule, now),
            createdAtMs: now,
            updatedAtMs: now,
            deleteAfterRun
        };
        this.jobs.push(job);
        await this.saveJobs();
        this.armTimer();
        return job;
    }

    public async removeJob(id: string): Promise<boolean> {
        const initialLength = this.jobs.length;
        this.jobs = this.jobs.filter(j => j.id !== id);
        if (this.jobs.length < initialLength) {
            await this.saveJobs();
            this.armTimer();
            return true;
        }
        return false;
    }

    public listJobs(): CronJob[] {
        return this.jobs;
    }
}
