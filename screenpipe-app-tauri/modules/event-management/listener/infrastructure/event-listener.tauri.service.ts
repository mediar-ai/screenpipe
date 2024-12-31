import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { EventListenerService } from "../interfaces/event-listener.service.interface";

export class TauriEventListener implements EventListenerService { 
    private listeners: Record<string, UnlistenFn> = {}

    async on(event: string, listener: (eventData: any) => void) {
        const newListener = await listen(event, listener);
        this.listeners[event] = newListener
    }

    off(event: string) {
        this.listeners[event]()
    }
}