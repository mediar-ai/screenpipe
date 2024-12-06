import { completion } from 'litellm';
import { config } from 'dotenv';

// load environment variables
config();

interface LLMResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callGPT4(prompt: string): Promise<LLMResponse> {
  try {
    const response = await completion({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.5,
      max_tokens: 4000,
    });

    // ensure content exists and handle potential null/undefined
    if (!response.choices[0]?.message?.content) {
      throw new Error('no content in response');
    }

    // extract the relevant data from response
    const result: LLMResponse = {
      content: response.choices[0].message.content,
      model: response.model || 'unknown',
      usage: response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    return result;
  } catch (error) {
    console.error('error calling gpt-4:', error);
    throw error;
  }
}

// example usage
async function main() {
  const prompt = 'explain quantum computing in simple terms';
  try {
    const result = await callGPT4(prompt);
    console.log('response:', result.content);
    console.log('model:', result.model);
    console.log('token usage:', result.usage);
  } catch (error) {
    console.error('main error:', error);
  }
}

// uncomment to run the example
// main();

export { callGPT4, LLMResponse };
