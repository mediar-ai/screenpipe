const screenpipe = async (conf) => {
    const openAIKey = conf.openai;
    document.body.style.cursor = "wait";
    const msg = window.getSelection().toString();
  
    // Generate parameters for 3 different queries
    const paramsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            Each query should have "q", "offset", and "limit" fields. 
            Rules:
            - q should be a single keyword that would properly find in the text found on the user screen some infomation that would help answering the user question.
            Return a list of objects with the key "queries"`
          },
        ],
        'model': 'gpt-4o',
      })
    }).then(res => res.json());
  
    console.log(paramsResponse);
    const queries = JSON.parse(paramsResponse.choices[0].message.content).queries;
  
    // Query screenpipe 3 times with generated parameters
    const screenpipeResults = await Promise.all(queries.map(async (query) => {
      const response = await fetch(`http://localhost:3030/search?q=${encodeURIComponent(query.q)}&offset=${query.offset}&limit=${query.limit}`);
      return response.json();
    }));
  
    // Ask ChatGPT to write an answer based on screenpipe results
    const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`,
      },
      body: JSON.stringify({
        'messages': [
          { 'role': 'user', 'content': `Based on the user question "${msg}" and these data which corresponds to what has been seen on the user screen or through his mic: ${JSON.stringify(screenpipeResults)}, provide a comprehensive answer to the user intent.` },
        ],
        'model': 'gpt-4o',
      })
    }).then(res => res.json());
  
    document.body.style.cursor = "default";
    console.log(finalResponse);
  
    if (!finalResponse.choices?.[0]?.message?.content) {
      new Notice('Error from OpenAI');
      new Notice(JSON.stringify(finalResponse));
    }
  
    return `${msg}${finalResponse.choices[0].message.content}`;
  }
  
  module.exports = screenpipe;