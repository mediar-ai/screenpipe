import { AIProvider } from './base';
import { RequestBody, GeminiResponse } from '../types';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model!: GenerativeModel;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async createCompletion(body: RequestBody): Promise<Response> {
    this.model = this.client.getGenerativeModel({ model: body.model });
    const chat = this.model.startChat({
      history: this.formatMessages(body.messages),
      generationConfig: {
        temperature: body.temperature,
      }
    });

    const result = await chat.sendMessage(
      body.messages[body.messages.length - 1].content as string
    );
    const response = await result.response;

    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: response.text(),
          role: 'assistant'
        }
      }]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
    this.model = this.client.getGenerativeModel({ model: body.model });
    const chat = this.model.startChat({
      history: this.formatMessages(body.messages),
      generationConfig: {
        temperature: body.temperature,
      }
    });

    const result = await chat.sendMessage(
      body.messages[body.messages.length - 1].content as string
    );

    return new ReadableStream({
      async start(controller) {
        try {
          const response = await result.response;
          const text = response.text();
           
          // send text in chunks
          const chunkSize = 20;
          for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              choices: [{ delta: { content: chunk } }]
            })}\n\n`));
          }
          
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
  }

  formatMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      role: this.mapRole(msg.role),
      parts: [{ text: typeof msg.content === 'string' ? msg.content : this.formatContent(msg.content) }]
    }));
  }

  private mapRole(role: string): string {
    switch (role) {
      case 'user': return 'user';
      case 'assistant': return 'model';
      case 'system': return 'user';
      default: return 'user';
    }
  }

  private formatContent(content: any[]): string {
    return content
      .map(part => part.type === 'text' ? part.text : '')
      .join(' ');
  }
}