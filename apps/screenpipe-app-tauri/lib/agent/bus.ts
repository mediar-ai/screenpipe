export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface InboundMessage {
    id: string;
    sender: string;
    role: MessageRole;
    content: string;
    channel: string;
    chatId: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface OutboundMessage {
    id: string;
    recipient: string;
    role: MessageRole;
    content: string;
    channel: string;
    chatId: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

type MessageCallback<T> = (message: T) => void | Promise<void>;

export class MessageBus {
    private static instance: MessageBus;
    private inboundSubscribers: Set<MessageCallback<InboundMessage>> = new Set();
    private outboundSubscribers: Set<MessageCallback<OutboundMessage>> = new Set();

    private constructor() { }

    public static getInstance(): MessageBus {
        if (!MessageBus.instance) {
            MessageBus.instance = new MessageBus();
        }
        return MessageBus.instance;
    }

    public publishInbound(message: InboundMessage): void {
        for (const callback of this.inboundSubscribers) {
            try {
                Promise.resolve(callback(message)).catch(error => {
                    console.error('Error in inbound subscriber:', error);
                });
            } catch (error) {
                console.error('Synchronous error in inbound subscriber:', error);
            }
        }
    }

    public publishOutbound(message: OutboundMessage): void {
        for (const callback of this.outboundSubscribers) {
            try {
                Promise.resolve(callback(message)).catch(error => {
                    console.error('Error in outbound subscriber:', error);
                });
            } catch (error) {
                console.error('Synchronous error in outbound subscriber:', error);
            }
        }
    }

    public subscribeInbound(callback: MessageCallback<InboundMessage>): () => void {
        this.inboundSubscribers.add(callback);
        return () => this.inboundSubscribers.delete(callback);
    }

    public subscribeOutbound(callback: MessageCallback<OutboundMessage>): () => void {
        this.outboundSubscribers.add(callback);
        return () => this.outboundSubscribers.delete(callback);
    }
}
