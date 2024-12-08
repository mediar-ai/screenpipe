import { LLMResponse } from '../storage/types';

async function callGPT4(prompt: string): Promise<LLMResponse> {
  try {
    const messages = [
      {
        role: 'system',
        content: ''
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const body = {
      model: 'gpt-4o',
      messages,
      temperature: 0.5,
      stream: false
    };

    const response = await fetch('https://ai-proxy.i-f9f.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'unknown error');
    }

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('no content in response');
    }

    const result: LLMResponse = {
      content: data.choices[0].message.content,
      model: data.model || 'unknown',
      usage: data.usage || {
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

export { callGPT4 };
