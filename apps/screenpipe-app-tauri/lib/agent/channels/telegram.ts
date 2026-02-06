import { BaseChannel } from './manager';
import { OutboundMessage, InboundMessage } from '../bus';
import { v4 as uuidv4 } from 'uuid';

export class TelegramChannel extends BaseChannel {
    public name = 'telegram';
    private token: string;
    private lastUpdateId: number = 0;
    private pollInterval: number = 2000;

    constructor(token: string) {
        super();
        this.token = token;
    }

    public async start(): Promise<void> {
        if (!this.token) {
            console.error('Telegram token missing');
            return;
        }
        this.running = true;
        this.poll();
        console.log('Telegram channel started (polling)');
    }

    public async stop(): Promise<void> {
        this.running = false;
    }

    private async poll(): Promise<void> {
        while (this.running) {
            try {
                const response = await fetch(
                    `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`
                );
                const data = await response.json();

                if (data.ok && data.result.length > 0) {
                    for (const update of data.result) {
                        this.lastUpdateId = update.update_id;
                        if (update.message) {
                            await this.handleTelegramMessage(update.message);
                        }
                    }
                }
            } catch (error) {
                console.error('Telegram polling error:', error);
                await new Promise(r => setTimeout(r, 5000)); // Backoff
            }
            await new Promise(r => setTimeout(r, this.pollInterval));
        }
    }

    private async handleTelegramMessage(message: any): Promise<void> {
        if (!message.from || !message.chat) {
            console.warn('Skipping message without from or chat info');
            return;
        }
        const inbound: InboundMessage = {
            id: uuidv4(),
            sender: message.from.username || message.from.id.toString(),
            role: 'user',
            content: message.text || '',
            channel: 'telegram',
            chatId: message.chat.id.toString(),
            timestamp: message.date * 1000,
            metadata: {
                telegramMessageId: message.message_id,
                from: message.from
            }
        };
        await this.handleIncoming(inbound);
    }

    public async send(message: OutboundMessage): Promise<void> {
        try {
            await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: message.chatId,
                    text: message.content
                })
            });
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
        }
    }
}
