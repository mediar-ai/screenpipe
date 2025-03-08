main repo is here: https://github.com/mediar-ai/screenpipe

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

### Prerequisites

- Node.js
- HeyGen API Token
- Modern web browser

### Installation

1. Install dependencies:

2. Set up your environment variables:

HEYGEN_API_TOKEN=your_token_here

### Usage

typescript
import { StreamingAvatarDemo } from '@/components/streaming-avatar'
function App() {
return <StreamingAvatarDemo apiToken={process.env.HEYGEN_API_TOKEN} />
}

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

