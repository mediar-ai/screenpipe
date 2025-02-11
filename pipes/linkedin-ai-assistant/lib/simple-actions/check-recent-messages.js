"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRecentMessages = hasRecentMessages;
function hasRecentMessages(messages, daysThreshold = 7) {
    const now = new Date();
    return messages.some(msg => {
        if (!msg.timestamp)
            return false;
        const msgDate = new Date(msg.timestamp);
        const daysDiff = (now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= daysThreshold;
    });
}
