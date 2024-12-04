import { Message } from '../storage/types';
import { addDays, format, parse, startOfToday } from 'date-fns';

// map weekday names to numbers (0 = sunday)
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function standardizeTimestamps(messages: Message[]): Message[] {
    let currentDate: Date | null = null;
    const today = startOfToday();

    return messages.map(msg => {
        if (!msg.timestamp) return msg;
        const timestamp = msg.timestamp.toLowerCase();

        // handle relative dates first
        if (timestamp === 'today') {
            currentDate = today;
        } else if (timestamp === 'yesterday') {
            currentDate = addDays(today, -1);
        } else if (WEEKDAYS.includes(timestamp)) {
            // find the most recent occurrence of this weekday
            const dayIndex = WEEKDAYS.indexOf(timestamp);
            const todayIndex = today.getDay();
            const daysAgo = (todayIndex - dayIndex + 7) % 7;
            currentDate = addDays(today, -daysAgo);
        } else if (timestamp.includes(':')) {
            // it's a time - use current date
            if (!currentDate) return msg;
            
            // parse time (e.g. "8:05 PM")
            try {
                const timeDate = parse(timestamp, 'h:mm a', currentDate);
                return {
                    ...msg,
                    timestamp: format(timeDate, "yyyy-MM-dd'T'HH:mm:ss")
                };
            } catch (e) {
                console.error('failed to parse time:', timestamp);
                return msg;
            }
        } else {
            // it's a new date (e.g. "Jul 9, 2023")
            try {
                currentDate = parse(timestamp, 'MMM d, yyyy', new Date());
            } catch (e) {
                console.error('failed to parse date:', timestamp);
                return msg;
            }
        }

        // return standardized date without time
        return {
            ...msg,
            timestamp: format(currentDate, 'yyyy-MM-dd')
        };
    });
}
// test function
// if (require.main === module) {
//     const testMessages = [
//         { text: 'YC', timestamp: 'Jul 9, 2023', sender: 'Matthew' },
//         { text: 'msg1', timestamp: '8:05 PM', sender: 'Louis' },
//         { text: 'msg2', timestamp: 'Today', sender: 'Matthew' },
//         { text: 'msg3', timestamp: '9:28 PM', sender: 'Matthew' },
//         { text: 'msg4', timestamp: 'Sunday', sender: 'Matthew' },
//     ];

//     console.log('standardized messages:', 
//         JSON.stringify(standardizeTimestamps(testMessages), null, 2));
// }

