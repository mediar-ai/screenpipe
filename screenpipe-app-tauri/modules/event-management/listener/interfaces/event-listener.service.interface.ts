import { ScreenpipeAppEvent } from "../../emitter/interfaces/event-emitter.service.interface";

export type EventListenerCallback = (event: ScreenpipeAppEvent) => void
export interface EventListenerService {
    on(event: string, callback: EventListenerCallback): void;
    off(event: string): void;
}