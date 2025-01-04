import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { EventListenerCallback, EventListenerService } from "../interfaces/event-listener.service.interface";
import { ScreenpipeAppEvent } from "../../emitter/interfaces/event-emitter.service.interface";

export class TauriEventListener implements EventListenerService { 
    private listeners: Record<string, UnlistenFn> = {}

    async on(event: string, callback: EventListenerCallback) {
        const newListener = await listen<ScreenpipeAppEvent>(event, (event) => {
            callback(event.payload)
        });
        this.listeners[event] = newListener
    }

    off(event: string) {
        this.listeners[event]()
    }
}