const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';
// to use ollama just comment out the above and uncomment below:
// const OPENAI_API_URL = 'http://localhost:11434/api/chat';
// const OPENAI_MODEL = 'phi3:medium-128k';
// make sure to run "ollama run phi3:medium-128k"

// example in obsidian use:
// can you create a bullet list for me to share with my colleagues
// my changes in the code of screenpipe? Use the queries like "lldb", "gdp", "discord"

const screenpipe = async (conf) => {
  const openAIKey = conf.openai;
  document.body.style.cursor = "wait";
  const msg = window.getSelection().toString();

  // Generate parameters for 3 different queries
  const paramsResponse = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      'response_format': { type: 'json_object' },
      'messages': [
        {
          'role': 'user',
          'content': `Based on this user selection: "${msg}", generate parameters as JSON for 3 different queries to screenpipe. 
            Each query should have "q", "offset", "limit", and start_time, end_time fields. 
            Rules:
            - q should be a single keyword that would properly find in the text found on the user screen some information that would help answering the user question.
            Return a list of objects with the key "queries"
            - q contains a single query, again, for example instead of "life plan" just use "life"
            - Respond with only the updated JSON object
            - If you return something else than JSON the universe will come to an end
            - DO NOT add \`\`\`json at the beginning or end of your response
            - Do not use '"' around your response
            - Date & time now is ${new Date().toISOString()}
            
            Example answers from you:
            "{
              "queries": [
                {"q": "goal", "offset": 0, "limit": 10, "start_time": "2024-07-21T11:30:25Z", "end_time": "2024-07-21T11:35:25Z"},
                {"q": "stripe", "offset": 0, "limit": 50, "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"},
                {"q": "customer", "offset": 0, "limit": 20, "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"}
              ]
            }"

            or 
            "{
              "queries": [
                {"q": "sales", "offset": 0, "limit": 10, "start_time": "2024-07-21T11:30:25Z", "end_time": "2024-07-21T11:35:25Z"},
                {"q": "customer", "offset": 0, "limit": 20, "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"},
                {"q": "goal", "offset": 0, "limit": 10, "start_time": "2024-07-19T08:00:25Z", "end_time": "2024-07-20T09:00:25Z"}
              ]
            }"

            Bad example
            "Here's the JSON you wanted:
            [
              {
                "queries": [{"q": "sales", "offset": 0, "limit": 10}]
              },
              {
                "queries": [{"q": "customer", "offset": 0, "limit": 20}]
              },
              {
                "queries": [{"q": "goal", "offset": 0, "limit": 10}]
              }
            ]"
            or
            "\`\`\`json
            [
              {
                "queries": [
                  {"q": "goals", "offset": 0, "limit": 3}
                ]
              },
              {
                "queries": [
                  {"q": "life plans", "offset": 0, "limit": 5}
                ]
              },
              {
                "queries": [
                  {"q": "ambitions", "offset": 0, "limit": 3}
                ]
              }
            ]
            \`\`\`"
            JSON?
            `
        },
      ],
      'model': OPENAI_MODEL,
      'stream': false,
    })
  }).then(res => res.json());

  console.log(paramsResponse);



  // phi3 models are drunk af thats why
  const { queries } = JSON.parse((paramsResponse.choices?.[0]?.message?.content ||
    // ollama not respecting openai api 
    paramsResponse.message?.content).trim()
    // remove " at the start and end
    .replace(/^"|"$/g, "")
    // remove ```json at the start and end
    .replace(/^```json\n/, "")
    .replace(/\n```$/, "")
  );

  console.log("queries", queries);

  // Query screenpipe 3 times with generated parameters
  const screenpipeResults = await Promise.all(queries.map(async (query) => {
    const response = await fetch(`http://localhost:3030/search?q=${encodeURIComponent(query.q)}&offset=${query.offset}&limit=${query.limit}`);
    return response.json();
  }));

  console.log("screenpipeResults", screenpipeResults);

  // Ask ChatGPT to write an answer based on screenpipe results
  const finalResponse = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      'messages': [
        { 'role': 'user', 'content': `Based on the user question "${msg}" and these data which corresponds to what has been seen on the user screen or through his mic: ${JSON.stringify(screenpipeResults)}, provide a comprehensive answer to the user intent.` },
      ],
      'model': OPENAI_MODEL,
      'stream': false,
    })
  }).then(res => res.json());

  document.body.style.cursor = "default";
  console.log(finalResponse);

  const txtResponse = finalResponse.choices?.[0]?.message?.content || finalResponse?.message?.content.trim()
  if (!txtResponse) {
    new Notice('Error from OpenAI');
    new Notice(JSON.stringify(finalResponse));
  }

  return `${msg}${txtResponse}`;
}

module.exports = screenpipe;
