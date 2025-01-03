export interface EventListenerService {
    on(event: string, callback: (eventData: any) => void): void;
    off(event: string): void;
}