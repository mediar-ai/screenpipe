# CRM Pipe for Screenpipe (Issue #1073)

A dedicated pipe that monitors audio logs and uses LLMs to build a personality, pain-point, and desire profile for each distinct speaker encountered.

## Features
- **Automated Profiling:** Extracts "Big Five" personality traits, Pains, and Desires using OpenAI (or local Ollama).
- **Cron Based:** Runs hourly to process new interactions efficiently.
- **Local CRM:** Stores profiles as human-readable Markdown files in `~/.screenpipe/pipes/crm-pipe/data/`.
- **Privacy First:** Filters out the host user (Speaker ID 0) and processes only external speakers.

## Prerequisites
- Node.js v18+
- A running instance of [Screenpipe](https://screenpi.pe/) (or the included Mock Server)
- An OpenAI API Key OR a local Ollama instance.

## Setup & Installation

1. **Install dependencies:**
   ```bash
   npm install