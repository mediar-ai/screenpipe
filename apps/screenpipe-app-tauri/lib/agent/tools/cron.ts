import { z } from 'zod';
import { ToolDefinition } from '../types';
import { CronService, CronSchedule } from '../cron';

export const cronAddTool: ToolDefinition = {
    name: 'cron_add',
    description: 'Schedule a task to run later or periodically. Schedule kind can be "at" (specific time in ms) or "every" (interval in ms).',
    parameters: z.object({
        name: z.string().describe('A human-readable name for the job'),
        task: z.string().describe('The task message for the agent to execute'),
        kind: z.enum(['at', 'every']).describe('Schedule type'),
        value: z.number().describe('Timestamp (at) or interval in ms (every)'),
        delete_after_run: z.boolean().optional().describe('Whether to delete the job after first run (for "at" jobs)'),
    }),
    execute: async (args: { name: string; task: string; kind: 'at' | 'every'; value: number; delete_after_run?: boolean }) => {
        const service = CronService.getInstance();
        const schedule: CronSchedule = {
            kind: args.kind,
            at_ms: args.kind === 'at' ? args.value : undefined,
            every_ms: args.kind === 'every' ? args.value : undefined,
        };
        const job = await service.addJob(args.name, schedule, args.task, args.delete_after_run);
        return `Job "${job.name}" added successfully (id: ${job.id}). Next run: ${job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleString() : 'Never'}`;
    },
};

export const cronListTool: ToolDefinition = {
    name: 'cron_list',
    description: 'List all currently scheduled cron jobs.',
    parameters: z.object({}),
    execute: async () => {
        const service = CronService.getInstance();
        const jobs = service.listJobs();
        if (jobs.length === 0) return 'No scheduled jobs found.';

        let output = 'Scheduled Jobs:\n';
        jobs.forEach(j => {
            const nextRun = j.nextRunAtMs ? new Date(j.nextRunAtMs).toLocaleString() : 'Never';
            const status = j.enabled ? 'Enabled' : 'Disabled';
            output += `- ${j.name} (${j.id}) [${status}]: Next run ${nextRun}\n  Task: ${j.task.slice(0, 50)}${j.task.length > 50 ? '...' : ''}\n`;
        });
        return output;
    },
};

export const cronRemoveTool: ToolDefinition = {
    name: 'cron_remove',
    description: 'Remove a scheduled cron job by its ID.',
    parameters: z.object({
        id: z.string().describe('The ID of the job to remove'),
    }),
    execute: async ({ id }: { id: string }) => {
        const service = CronService.getInstance();
        const removed = await service.removeJob(id);
        return removed ? `Job ${id} removed successfully.` : `Job ${id} not found.`;
    },
};
