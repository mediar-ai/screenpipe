# RAG Search

Semantic search over your screen recordings and audio transcriptions using RAG (Retrieval Augmented Generation).

Unlike keyword search, RAG search understands the *meaning* of your query and finds relevant content even when exact words don't match.

## Features

- **Semantic Search**: Uses OpenAI embeddings to find contextually relevant content
- **Automatic Indexing**: Cron job indexes new screen data every 10 minutes
- **Frame Context**: Returns complete context from matching screen frames
- **Content Deduplication**: Filters duplicate content for cleaner results
- **Large Scale**: Handles 20K+ documents with optimized vector store

## Setup

1. Install the pipe in Screenpipe
2. Go to Settings and add your OpenAI API key
3. Click "Run Index" to build the initial index
4. Start asking questions about your screen history

## How It Works

1. OCR text and audio transcriptions are chunked and embedded using OpenAI's `text-embedding-ada-002`
2. Embeddings are stored in a local vector store (JSON file)
3. When you search, your query is embedded and compared against stored documents using cosine similarity
4. Top matching frames are expanded to include full context
5. Results are sent to GPT-4o-mini to generate a natural language answer

## Requirements

- OpenAI API key (for embeddings and chat)
- Screenpipe running with OCR/audio capture enabled
