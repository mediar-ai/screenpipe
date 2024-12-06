import { Message } from '../storage/types';
import { addDays, format, parse, startOfToday } from 'date-fns';

// map weekday names to numbers (0 = sunday)
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// helper to check if string matches "Month Day" format (e.g. "Nov 6")
const isMonthDayFormat = (str: string) => /^[A-Za-z]{3}\s+\d{1,2}$/.test(str);

export function standardizeTimestamps(messages: Message[]): Message[] {
    let currentDate: Date | null = null;
    const today = startOfToday();
    const currentYear = today.getFullYear();

    return messages.map(msg => {
        if (!msg.timestamp) return msg;
        const timestamp = msg.timestamp.toLowerCase();

        try {
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
                if (!currentDate) currentDate = today;
                const timeDate = parse(timestamp, 'h:mm a', currentDate);
                return {
                    ...msg,
                    timestamp: format(timeDate, "yyyy-MM-dd'T'HH:mm:ss")
                };
            } else if (isMonthDayFormat(timestamp)) {
                // handle "Month Day" format (e.g. "Nov 6")
                currentDate = parse(`${timestamp} ${currentYear}`, 'MMM d yyyy', new Date());
            } else {
                // try full date format (e.g. "Jul 9, 2023")
                currentDate = parse(timestamp, 'MMM d, yyyy', new Date());
            }

            // return standardized date without time
            return {
                ...msg,
                timestamp: format(currentDate!, 'yyyy-MM-dd')
            };
        } catch (e) {
            console.error('failed to parse timestamp:', timestamp, e);
            return msg;
        }
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

