# pipe-llama32-sync-user-conversation-to-notion

This pipe automatically summarizes your user conversations (screen text only) and sends the summaries to a Notion database. It uses AI to analyze screen content from your meetings and generate structured tables.

## Quick Setup

1. Run Ollama:
   ```
   ollama run llama3.2:3b-instruct-q4_K_M
   ```

2. Set up Notion:
   a. Create a new integration at https://www.notion.so/my-integrations
   b. Copy the API key for later use
   c. Create a new database in Notion with the following properties:
      - Summary (Title)
      - Key Points (Rich text)
      - Action Items (Rich text)
      - Pain Points (Rich text)
      - Needs (Rich text)
      - Sentiment (Select)
      - Timestamp (Date)
   d. Share the database with your integration:
      - Open the database
      - Click the '...' menu in the top right
      - Go to 'Add connections' and select your integration
   e. Copy the database ID from the URL:
      - Open the database in full-page view
      - The URL will look like: https://www.notion.so/your-workspace/database-id?v=...
      - Copy the 'database-id' part

3. Configure the pipe:
   a. Open the Screenpipe app
   b. Go to the Pipes section
   c. Find or add the "pipe-meeting-summary-by-notion" pipe
   d. Configure the following fields:
      - Polling Interval (default: 3600000 ms / 1 hour)
      - Notion API Key (from step 2b)
      - Notion Database ID (from step 2e)
      - AI API URL (default: http://localhost:11434/api/chat for Ollama)
      - AI Model (default: llama3.2:3b-instruct-q4_K_M)
      - Custom Summary Prompt (optional)
   e. Save the configuration
   f. Enable the pipe

4. Restart Screenpipe recording

That's it! The pipe will now periodically check for new audio content, summarize it using AI, and send the summaries to your Notion database.

## Customization

To customize the pipe's behavior, you can modify the `pipe.ts` file. Key areas you might want to adjust include:
