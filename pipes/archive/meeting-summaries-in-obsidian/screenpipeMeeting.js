const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';
// to use ollama just comment out the above and uncomment below:
// const OPENAI_API_URL = 'http://localhost:11434/api/chat';
// const OPENAI_MODEL = 'phi3:medium-128k';
// make sure to run "ollama run phi3:medium-128k"
const SCREENPIPE_API_URL = 'http://localhost:3030/search';

const generateMeetingSummary = async (openAIKey, meetingDuration, startTimestamp, endTimestamp) => {
  // Step 5: Query Screenpipe API for audio transcripts
  const startTime = encodeURIComponent(startTimestamp);
  const screenpipeUrl = `${SCREENPIPE_API_URL}?limit=1000&offset=0&content_type=audio&start_time=${startTime}`;
  console.log("going to fetch", screenpipeUrl);

  const response = await fetch(screenpipeUrl);
  const screenpipeResults = await response.json();
  console.log("got", screenpipeResults.data.length, "results from screenpipe");

  const transcriptText = JSON.stringify(screenpipeResults);

  // Step 6: Generate meeting summary using ChatGPT
  const summaryResponse = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      'messages': [
        {
          'role': 'system',
          'content': 'You are an AI assistant that summarizes meetings and extracts action items. Make sure to ignore noise from bad transcripts.'
        },
        {
          'role': 'user',
          'content': `Please summarize the following meeting transcript and provide a list of action items at the top:

${transcriptText}`
        }
      ],
      'model': OPENAI_MODEL,
      'stream': false
    })
  })
    .catch(err => console.error(err))
    .then(res => res.json());
  console.log("answer from AI", summaryResponse);

  const summary = summaryResponse.choices?.[0]?.message?.content || summaryResponse?.message?.content.trim()

  const noteTitle = `Meeting Summary - ${startTimestamp.split('T')[0]}`;
  const noteContent = `# ${noteTitle}

${summary}

Meeting Duration: ${meetingDuration} minutes
Start Time: ${startTimestamp}
End Time: ${endTimestamp}
`;

  return { noteTitle, noteContent };
};

const screenpipe = async (conf, meetingDuration) => {
  const openAIKey = conf.openai;

  // Step 1: Ask for meeting duration
  if (!meetingDuration) return "Meeting duration not provided.";

  // Step 2 & 3: Start recording and store start timestamp
  const startTimestamp = new Date().toISOString();
  new Notice(`Recording started. Meeting will end in ${meetingDuration} minutes.`);

  // Step 4: Wait for the meeting duration and store end timestamp
  await new Promise(resolve => setTimeout(resolve, meetingDuration * 60 * 1000));
  const endTimestamp = new Date().toISOString();
  new Notice("Recording stopped. Processing meeting data...");

  new Notice("Generating meeting summary...");

  const { noteTitle, noteContent } = await generateMeetingSummary(openAIKey, meetingDuration, startTimestamp, endTimestamp);

  new Notice("Creating meeting summary note...");

  // Create the new note using Obsidian API
  await app.vault.create(noteTitle + '.md', noteContent);

  new Notice("Meeting summary created successfully!");

  return `Meeting summary created: [[${noteTitle}]]`;
};

module.exports = screenpipe;

// testing 
// generateMeetingSummary(process.env.OPENAI_API_KEY, 10,
//   // 1h ago
//   new Date(Date.now() - 90 * 60 * 1000).toISOString(),
//   // 10m ago
//   new Date(Date.now() - 10 * 60 * 1000).toISOString(),
// ).then(console.log);
