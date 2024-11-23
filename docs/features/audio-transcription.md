## Audio Transcription Engines

Screenpipe supports multiple audio transcription engines:

- `whisper-tiny`: Local lightweight Whisper model
- `whisper-large`: Local Whisper large model (better quality)
- `whisper-large-v3-turbo`: Local Whisper large v3 turbo model (best quality/speed trade-off)
- `deepgram`: Cloud-based transcription service (requires API key)
- `custom`: Custom STT API endpoint (requires URL)

### Using a Custom STT API

You can use your own Speech-to-Text API endpoint by using the `custom` engine and providing the API URL: 