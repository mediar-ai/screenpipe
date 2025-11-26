import express from 'express';

const app = express();
const PORT = 3030; // Screenpipe default port

// --- FAKE AUDIO DATA ---
// We simulate a sales call with a prospect named "Alice" (Speaker 1)
// and a tech lead "Bob" (Speaker 2).
const MOCK_DATA = {
    data: [
        {
            content: {
                timestamp: new Date().toISOString(),
                speaker_id: 1, // The Prospect
                transcription: "I am really frustrated with my current CRM. It takes too long to load and I hate manual data entry. I just want something that works automatically."
            }
        },
        {
            content: {
                timestamp: new Date().toISOString(),
                speaker_id: 2, // You/Interviewer
                transcription: "I understand. What is your main goal for Q4?"
            }
        },
        {
            content: {
                timestamp: new Date().toISOString(),
                speaker_id: 1, // The Prospect
                transcription: "My goal is to double our lead velocity. I'm an aggressive growth hacker type, I don't care about safety, I just want speed. If you can automate the data entry, I will buy immediately."
            }
        }
    ]
};

// --- THE IMPOSTOR ENDPOINT ---
app.get('/search', (req: any, res: any) => {
    console.log(`[Mock Server] 📡 Received Query: ${req.url}`);
    console.log(`[Mock Server] 📤 Sending fake audio logs...`);
    res.json(MOCK_DATA);
});

// --- START ---
app.listen(PORT, () => {
    console.log(`
    -----------------------------------------------------
    🎭 SCREENPIPE SIMULATOR ONLINE (Port ${PORT})
    -----------------------------------------------------
    Listening for requests from CRM Pipe...
    `);
});