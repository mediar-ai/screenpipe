# Workflow Analyzer Pipe

This pipe automatically analyzes your daily activity to provide a structured summary of your workday. It can be triggered automatically at the end of the day or run manually for specific time ranges.

## Core Features

*   **Automatic Daily Analysis**: Runs a cron job every night at 9 PM to analyze your digital activity from 9 AM to 9 PM.
*   **Manual Analysis**: Allows you to select any date and specify a start/end time to run the analysis on demand.
*   **Data-Rich UI**: Presents the collected data in a clear and insightful way.
*   **AI-Powered Summaries (Phase 2)**: Uses a configurable AI provider to generate a structured analysis of your activity, including topics, application usage, and key takeaways.

---

## Implementation Plan

This plan is broken into two phases. Phase 1 focuses on fetching and displaying the data. Phase 2 integrates AI for analysis.

### Phase 1: Data Fetching & UI

This phase establishes the core functionality of the pipe: scheduling, manual controls, and data retrieval.

#### 1. **Configuration (`pipe.json`)**

To enable automatic daily analysis, we will set up a cron job. This file should be at the root of your pipe directory.

```json:pipes/workflow-analyzer/pipe.json
{
  "crons": [
    {
      "path": "/api/analyze",
      "schedule": "0 21 * * *"
    }
  ]
}
```

*   `path`: The API route inside our pipe that the cron job will call.
*   `schedule`: "0 21 * * *" means it will run at 21:00 (9 PM) every day.

#### 2. **UI Components (`app/page.tsx`)**

The main page will provide the user interface for manual analysis and for displaying results.

*   **Date and Time Pickers**:
    *   We need a date picker for selecting the day to analyze.
    *   We need two time selectors for the start and end times, defaulting to 9:00 AM and 9:00 PM.
    *   **Reference**: The `DateTimePicker` component in `pipes/search/src/components/date-time-picker.tsx` is a perfect reference for building this.
*   **"Run Analysis" Button**: A button to trigger the manual analysis.
*   **Results Display Area**: A section to render the fetched data. Initially, this can be a simple list or table.

#### 3. **API Layer (`app/api/analyze/route.ts`)**

This is the backend logic for the pipe. It will be triggered by both the cron job and the manual "Run" button.

*   **Endpoint Logic**:
    1.  The `POST` function will handle incoming requests.
    2.  It will check the request body for `startDate` and `endDate`.
    3.  If they are not present (i.e., called from the cron), it will calculate the time range for the current day (9 AM to 9 PM).
    4.  It will use the `@screenpipe/js` SDK to fetch data.
*   **Data Fetching**:
    *   We will use the `pipe.search()` function, which is a powerful, high-level method for querying data.
    *   **Reference**: See the `handleSearch` function in `pipes/search/src/components/search-chat.tsx` for a detailed example of how to construct search parameters.
    *   We will query for both `ocr` and `audio_transcriptions` content types within the specified time range.

    ```typescript
    // Example call within app/api/analyze/route.ts
    import { pipe } from "@screenpipe/js";

    // ... inside the POST handler
    const ocrResults = await pipe.search({
      content_type: 'ocr',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      limit: 1000, // Adjust as needed
    });

    const audioResults = await pipe.search({
      content_type: 'audio_transcriptions',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      limit: 1000, // Adjust as needed
    });

    const combinedData = [...ocrResults.data, ...audioResults.data];
    // Return combinedData to the frontend
    ```

#### 4. **Data Representation**

The UI will receive the fetched data and render it.

*   We can create components to display OCR and audio data in a timeline view.
*   **Reference**: The `OcrDataTable` and `AudioTranscriptionsTable` components in `pipes/data-table/src/components/` provide excellent examples of how to structure and display this data.

### Phase 2: AI Analysis (Future)

Once data fetching is complete, we can add the AI-powered analysis layer.

#### 1. **AI Provider Setup**

We will allow users to select their preferred AI model (OpenAI, Ollama, etc.) by integrating the AI preset management system from the `search` pipe.

*   **Integration**: Add the `AIPresetsSelector` component from `pipes/search/src/components/ai-presets-selector.tsx` to the UI.
*   **Configuration**: This component uses the `usePipeSettings` hook to store the selected preset ID for this specific pipe, ensuring it doesn't interfere with other pipes.
*   **Dependencies**: This will require copying over the related components and hooks (`ai-presets-dialog.tsx`, `use-settings.tsx`, `use-pipe-settings.ts`).

#### 2. **Context Building and Prompting**

The API endpoint (`/api/analyze`) will be updated to perform AI analysis.

*   **Build Context**: Concatenate all the fetched OCR text and audio transcriptions into a single string.
*   **Create Prompt**: A system prompt will guide the AI to perform the desired analysis.

    ```
    System Prompt Example:

    You are a workflow analysis assistant. Based on the following screen recordings (OCR) and audio transcriptions from a user's day, provide a structured summary in Markdown format.

    The summary should include:
    1.  **Key Topics**: A list of the main subjects and projects the user worked on.
    2.  **Application Usage**: A breakdown of the primary applications used and for what purpose.
    3.  **Action Items**: A list of potential action items or follow-ups mentioned.
    4.  **Overall Summary**: A brief, one-paragraph summary of the day's activities.

    Here is the data:
    ---
    [CONTEXT_STRING_GOES_HERE]
    ---
    ```

*   **AI Chat**: Use the Vercel `ai` SDK's `useChat` hook (on the client) or `OpenAIStream` (on the server) to send the context and prompt to the selected AI model and stream the response back to the UI.
*   **Reference**: The `search-chat.tsx` component is the primary reference for this. The main logic for handling AI responses and streaming is contained within its `useChat` implementation.