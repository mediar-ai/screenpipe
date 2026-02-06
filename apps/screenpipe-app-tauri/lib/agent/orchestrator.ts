import OpenAI from 'openai';
import { MessageBus, InboundMessage, OutboundMessage, MessageRole } from './bus';
import { CronService } from './cron';
import { HeartbeatService } from './heartbeat';
import { SubagentManager, createSpawnTool } from './subagent';
import { SessionManager, Session, SessionMessage } from './session';
import { ChannelManager } from './channels/manager';
import { SkillManager } from './skills';
import { runAgentLoop } from './loop';
import { AgentContext } from './types';
import { ToolRegistry } from './registry';
import { v4 as uuidv4 } from 'uuid';

export class AgentOrchestrator {
    private static instance: AgentOrchestrator;
    private bus: MessageBus;
    private cron: CronService;
    private heartbeat: HeartbeatService;
    private subagents: SubagentManager;
    private sessions: SessionManager;
    private channels: ChannelManager;
    private skills: SkillManager;
    private apiKey: string = '';

    private defaultContext: AgentContext = {
        model: 'gpt-4o',
        provider: 'openai',
        systemPrompt: 'You are a helpful assistant.',
        memoryEnabled: true
    };

    private constructor() {
        this.bus = MessageBus.getInstance();
        this.cron = CronService.getInstance();
        this.heartbeat = HeartbeatService.getInstance();
        this.subagents = SubagentManager.getInstance();
        this.sessions = SessionManager.getInstance();
        this.channels = ChannelManager.getInstance();
        this.skills = SkillManager.getInstance();
    }

    public static getInstance(): AgentOrchestrator {
        if (!AgentOrchestrator.instance) {
            AgentOrchestrator.instance = new AgentOrchestrator();
        }
        return AgentOrchestrator.instance;
    }

    private inboundSubscription?: () => void;
    private outboundSubscription?: () => void;

    public async start(): Promise<void> {
        try {
            // Get API key and register spawn tool dynamically
            this.apiKey = process.env.OPENAI_API_KEY || '';
            if (this.apiKey) {
                const registry = ToolRegistry.getInstance();
                const spawnTool = createSpawnTool(this.defaultContext, this.apiKey);
                registry.register(spawnTool);
            }

            // Start services
            await this.cron.start(this.handleCronJob.bind(this));
            await this.heartbeat.start(this.handleHeartbeat.bind(this));
            await this.channels.startAll();
            await this.skills.loadAllSkills();

            // Subscribe to outbound messages for channel routing
            this.outboundSubscription = this.bus.subscribeOutbound(this.handleOutbound.bind(this));

            // Subscribe to inbound messages
            this.inboundSubscription = this.bus.subscribeInbound(this.handleInbound.bind(this));
        } catch (error) {
            console.error('Failed to start orchestrator:', error);
            this.stop();
            throw error;
        }

        console.log('Agent Orchestrator started');
    }

    private async handleInbound(message: InboundMessage): Promise<void> {
        console.log(`Orchestrator: Received message from ${message.sender}`);

        // If it's a direct user message or a subagent completion that needs attention
        if (message.role === 'user' || (message.role === 'system' && message.metadata?.status === 'success')) {
            const sessionId = message.metadata?.sessionId || 'default';
            const session: Session = await this.sessions.loadSession(sessionId) || {
                id: sessionId,
                messages: [] as SessionMessage[],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Add new message to history
            session.messages.push({
                role: message.role,
                content: message.content,
                timestamp: message.timestamp
            });

            // Build dynamic system prompt with skills
            const context = {
                ...this.defaultContext,
                systemPrompt: `${this.defaultContext.systemPrompt}\n\n${this.skills.getSkillsSummary()}`
            };

            // Limit message history to prevent context window overflow (keep last 50 messages)
            const MAX_MESSAGES = 50;
            const recentMessages = session.messages.slice(-MAX_MESSAGES);

            const result = await runAgentLoop(
                recentMessages.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
                context,
                this.apiKey
            );

            // Add assistant response to history
            session.messages.push({
                role: 'assistant',
                content: result.output,
                timestamp: Date.now(),
                tool_calls: result.toolCalls
            });

            await this.sessions.saveSession(session);

            this.bus.publishOutbound({
                id: uuidv4(),
                recipient: message.sender,
                role: 'assistant',
                content: result.output,
                channel: message.channel,
                chatId: message.chatId,
                timestamp: Date.now(),
                metadata: { sessionId }
            });
        }
    }

    private async handleOutbound(message: OutboundMessage): Promise<void> {
        // Here we could add logic to intercept/log outbound messages
        console.log(`Orchestrator: Outbound to ${message.channel}:${message.chatId}`);
    }

    private async handleCronJob(job: any): Promise<void> {
        console.log(`Orchestrator: Running cron job ${job.name}`);
        const result = await runAgentLoop(job.task, this.defaultContext, this.apiKey);

        // Optionally save to a session for the cron job
        await this.sessions.saveSession({
            id: `cron-${job.id}`,
            messages: [
                { role: 'user', content: job.task, timestamp: Date.now() },
                { role: 'assistant', content: result.output, timestamp: Date.now() }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: { jobId: job.id }
        });
    }

    private async handleHeartbeat(prompt: string): Promise<string> {
        console.log('Orchestrator: Heartbeat tick');
        const result = await runAgentLoop(prompt, this.defaultContext, this.apiKey);
        return result.output;
    }

    public stop(): void {
        // Stop core services
        this.cron?.stop();
        this.heartbeat?.stop();

        // Stop all channels
        if (this.channels) {
            try {
                this.channels.stopAll();
            } catch (error) {
                console.error('Error stopping channels:', error);
            }
        }

        // Unsubscribe from message bus
        if (this.outboundSubscription) {
            try {
                this.outboundSubscription();
            } catch (error) {
                console.error('Error unsubscribing outbound:', error);
            }
            this.outboundSubscription = undefined;
        }

        if (this.inboundSubscription) {
            try {
                this.inboundSubscription();
            } catch (error) {
                console.error('Error unsubscribing inbound:', error);
            }
            this.inboundSubscription = undefined;
        }
    }
}
