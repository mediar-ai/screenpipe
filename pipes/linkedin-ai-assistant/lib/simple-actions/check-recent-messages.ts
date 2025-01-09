import { Message } from '../storage/types';

export function hasRecentMessages(messages: Message[], daysThreshold = 7): boolean {
    const now = new Date();
    return messages.some(msg => {
        if (!msg.timestamp) return false;
        const msgDate = new Date(msg.timestamp);
        const daysDiff = (now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= daysThreshold;
    });
}