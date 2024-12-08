import { Message } from '../storage/types';
import { addDays, format, parse, startOfToday } from 'date-fns';

export function standardizeTimestamps(messages: Message[]): Message[] {
    const today = startOfToday();
    const currentYear = today.getFullYear();
    let lastValidTimestamp: string | null = null;

    return messages.map(msg => {
        if (!msg.timestamp) return msg;
        const timestamp = msg.timestamp.toLowerCase();
        console.log('processing timestamp:', timestamp);

        try {
            let date: Date;
            const now = new Date();

            // Handle different timestamp formats
            if (timestamp.includes('today')) {
                date = now;
            } else if (timestamp.includes('yesterday')) {
                date = addDays(now, -1);
            } else if (timestamp.match(/^monday|tuesday|wednesday|thursday|friday|saturday|sunday/)) {
                // Handle "Monday 5:50 PM" format
                const [dayName, time, period] = timestamp.split(' ');
                const [hours, minutes] = time.split(':');
                
                // Find the most recent occurrence of this weekday
                const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName);
                const todayIndex = now.getDay();
                const daysAgo = (todayIndex - dayIndex + 7) % 7;
                date = addDays(now, -daysAgo);

                // Set the time
                let hour = parseInt(hours);
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
                date.setHours(hour, parseInt(minutes));
            } else if (timestamp.match(/^[a-z]{3}\s+\d{1,2}\s+\d{1,2}:\d{2}\s+[ap]m/)) {
                // Handle "Nov 6 12:54 PM" format
                const [month, day, time, period] = timestamp.split(' ');
                const [hours, minutes] = time.split(':');
                
                const monthMap: { [key: string]: number } = {
                    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                };
                
                date = new Date(currentYear, monthMap[month], parseInt(day));
                let hour = parseInt(hours);
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
                date.setHours(hour, parseInt(minutes));
            } else if (timestamp.match(/^\d{1,2}:\d{2}\s+[ap]m/)) {
                // Handle time-only format using the last known date
                const [time, period] = timestamp.split(' ');
                const [hours, minutes] = time.split(':');
                
                date = lastValidTimestamp ? 
                    new Date(lastValidTimestamp) : 
                    now;
                
                let hour = parseInt(hours);
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
                date.setHours(hour, parseInt(minutes));
            } else {
                // Use last known timestamp if format is unknown
                return {
                    ...msg,
                    timestamp: lastValidTimestamp || msg.timestamp
                };
            }

            const standardizedTimestamp = format(date, "yyyy-MM-dd'T'HH:mm:ss");
            lastValidTimestamp = standardizedTimestamp;
            
            return {
                ...msg,
                timestamp: standardizedTimestamp
            };
        } catch (e) {
            console.error('failed to parse timestamp:', timestamp, e);
            return {
                ...msg,
                timestamp: lastValidTimestamp || msg.timestamp
            };
        }
    });
}

