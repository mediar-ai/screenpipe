import { Message, RequestBody } from '../types';

export interface AIProvider {
	supportsTools: boolean;
	supportsVision: boolean;
	supportsJson: boolean;

	createCompletion(body: RequestBody): Promise<Response>;
	createStreamingCompletion(body: RequestBody): Promise<ReadableStream>;
	formatMessages(messages: Message[]): any;
	formatResponse(response: any): any;
}
