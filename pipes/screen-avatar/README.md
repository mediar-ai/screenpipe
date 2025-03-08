# Screen Avatar

A customizable streaming avatar interface built with React, TypeScript, and the HeyGen Streaming Avatar API. This project creates an interactive AI avatar that can communicate through text and voice, perfect for creating engaging digital assistants or virtual companions.

## Features

- 🎭 Real-time streaming avatar with voice and text interaction
- 🎙️ Push-to-talk functionality
- 💬 Text-to-speech capabilities
- 🖼️ Floating window mode
- 🎛️ Multiple avatar selection
- 🔊 Voice chat with silence detection
- 🎯 Always-on-top window support

## Getting Started

1. Make sure Screenpipe is properly configured:
   - Open Screenpipe and go to Account -> Settings -> Recording
   - Enable "Realtime vision processing" - Set to YES
   - Enable "Realtime audio transcription" - Set to YES
   - Go to Settings -> AI Settings
   - Set up your OpenAI API key or connect to Screenpipe Cloud

2. Set up environment variables:
   - Rename `.env.local` to `.env`
   - Add your API keys to the `.env` file:
     ```
     HEYGEN_API_TOKEN=your_token_here
     NEXT_PUBLIC_HEYGEN_API_KEY=your_token_here
     NEXT_PUBLIC_ELEVENLABS_API_KEY=your_token_here
     ```

3. Install dependencies:
   ```
   npm i --legacy-peer-deps --ignore-scripts
   ```

4. Start the development server:
   ```
   npm run dev
   ```

## Configuration

The avatar can be customized with various options:

- Quality settings (Low/Medium/High)
- Voice emotion and rate
- Custom knowledge base for responses
- Window positioning and appearance
- Language settings

## API Reference

### Key Components

- `StreamingAvatarDemo`: Main component for avatar interaction
- `AvatarVideo`: Video display component
- `AudioInput`: Voice input handling
- `InteractiveAvatarTextInput`: Text input interface

### Events

- `STREAM_READY`: Fired when avatar stream is initialized
- `STREAM_STOPPED`: Fired when avatar stream ends
- `USER_START`: Triggered when user starts talking
- `USER_STOP`: Triggered when user stops talking

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Contacts

Reach out to me: i@m13v.com
Discord: "m13v_"