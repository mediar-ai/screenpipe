import { RequestBody } from '../types';

export interface AIProvider {
  createCompletion(body: RequestBody): Promise<Response>;
  createStreamingCompletion(body: RequestBody): Promise<ReadableStream>;
  formatMessages(messages: any[]): any;
}