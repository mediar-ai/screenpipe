export interface EventListenerService {
    on(event: string, listener: (eventData: any) => void): void;
    off(event: string): void;
}