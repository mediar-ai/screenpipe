import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { EventListenerService } from "../interfaces/event-listener.service.interface";

export class TauriEventListener implements EventListenerService { 
    private listeners: Record<string, UnlistenFn> = {}

    async on(event: string, callback: (eventData: any) => void) {
        const newListener = await listen(event, callback);
        this.listeners[event] = newListener
    }

    off(event: string) {
        this.listeners[event]()
    }
}