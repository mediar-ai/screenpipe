// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { RequestBody } from '../types';

export function hasImages(body: Pick<RequestBody, 'messages'>): boolean {
  return body.messages.some(message => Array.isArray(message.content) && message.content.some(part =>
    part.type === 'image' || part.type === 'image_url' || (part.type === 'file' && part.mimeType?.startsWith('image/'))));
}
