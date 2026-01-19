# Speech Coach Pipe

A real-time speech coaching tool for Screenpipe that helps you improve your speaking by tracking filler words and providing feedback.

![Speech Coach](https://img.shields.io/badge/bounty-%24100--300-green)

## Features

- **Real-time Filler Word Detection**: Tracks common filler words like "um", "uh", "like", "you know", "basically", etc.
- **Speaking Pace Analysis**: Monitors your words per minute to help maintain optimal speaking speed
- **Live Mode**: Automatically refreshes every 5 seconds for real-time feedback during calls
- **Personalized Tips**: Get specific advice for reducing your most common filler words
- **Beautiful Dashboard**: Clean, modern UI inspired by Poised AI

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Filler Rate | Percentage of filler words in your speech |
| Total Fillers | Count of all filler words detected |
| Words/Min | Speaking pace (120-180 WPM is ideal) |
| Total Words | Overall word count |

## Filler Words Detected

- um, uh, uhh, umm, er, ah
- like, you know, basically
- literally, actually, right
- so, well, i mean
- kind of, sort of, you see
- okay, honestly, obviously

## Getting Started

```bash
# Install dependencies
bun i

# Start the development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to see your speech dashboard.

**Note:** Make sure Screenpipe is running on port 3030 for the pipe to fetch audio transcription data.

## How It Works

1. The pipe queries Screenpipe's audio transcriptions from your microphone input
2. Analyzes the text for common filler words
3. Calculates speaking metrics (pace, filler rate, etc.)
4. Displays an interactive dashboard with insights and tips

## Configuration

- **Time Range**: Choose from 1h, 6h, or 24h of speech data
- **Live Mode**: Toggle real-time updates during calls

## Deploy on Screenpipe

This pipe can be deployed on the [Screenpipe Platform](https://screenpi.pe).

Check out the [pipe deployment documentation](https://docs.screenpi.pe/plugins) for more details.

## Credits

Inspired by [Poised AI](https://www.poised.com/) and [Spellar AI](https://spellar.ai/)
