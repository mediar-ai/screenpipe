import { MessageBus, OutboundMessage, InboundMessage } from '../bus';

export abstract class BaseChannel {
    public abstract name: string;
    protected bus: MessageBus;
    protected running: boolean = false;

    constructor() {
        this.bus = MessageBus.getInstance();
    }

    public abstract start(): Promise<void>;
    public abstract stop(): Promise<void>;
    public abstract send(message: OutboundMessage): Promise<void>;

    protected async handleIncoming(message: InboundMessage): Promise<void> {
        this.bus.publishInbound(message);
    }
}

export class ChannelManager {
    private static instance: ChannelManager;
    private channels: Map<string, BaseChannel> = new Map();
    private bus: MessageBus;

    private constructor() {
        this.bus = MessageBus.getInstance();
        this.bus.subscribeOutbound(this.routeOutbound.bind(this));
    }

    public static getInstance(): ChannelManager {
        if (!ChannelManager.instance) {
            ChannelManager.instance = new ChannelManager();
        }
        return ChannelManager.instance;
    }

    public register(channel: BaseChannel): void {
        this.channels.set(channel.name, channel);
    }

    public async startAll(): Promise<void> {
        const results = await Promise.allSettled(
            Array.from(this.channels.values()).map(channel => channel.start())
        );
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error('Channel failed to start:', result.reason);
            }
        }
    }

    public async stopAll(): Promise<void> {
        const results = await Promise.allSettled(
            Array.from(this.channels.values()).map(channel => channel.stop())
        );
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error('Channel failed to stop:', result.reason);
            }
        }
    }

    private async routeOutbound(message: OutboundMessage): Promise<void> {
        const channel = this.channels.get(message.channel);
        if (channel) {
            await channel.send(message);
        } else if (message.channel === 'app') {
            // Internal app channel - might be handled by UI listeners
            console.log('Internal message:', message.content);
        } else {
            console.warn(`No channel registered for: ${message.channel}`);
        }
    }
}
