import { AIProvider } from './base';
import { Message, RequestBody } from '../types';
import { Anthropic } from '@anthropic-ai/sdk';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createCompletion(body: RequestBody): Promise<Response> {
    const response = await this.client.messages.create({
      messages: this.formatMessages(body.messages),
      model: body.model,
      max_tokens: 4096,
      temperature: body.temperature,
    });

    return new Response(JSON.stringify(this.formatResponse(response)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
    const stream = await this.client.messages.create({
      messages: this.formatMessages(body.messages),
      model: body.model,
      stream: true,
      max_tokens: 4096,
      temperature: body.temperature,
    });

    return new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            controller.enqueue(chunk.delta.text);
          }
        }
        controller.close();
      },
    });
  }

  formatMessages(messages: Message[]): any {
    return messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : this.formatContent(msg.content),
    }));
  }

  private formatContent(content: any[]): string {
    return content
      .map(part => (part.type === 'text' ? part.text : ''))
      .join('');
  }

  formatResponse(response: any): any {
    return {
      choices: [{
        message: {
          content: response.content[0].text,
          role: 'assistant',
        },
      }],
    };
  }
}