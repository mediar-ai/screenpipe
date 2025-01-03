import { EventListenerService } from "../interfaces/event-listener.service.interface";

export class WindowEventListener implements EventListenerService {
    private listeners: Record<string, (eventData: any) => void> = {}

    on(event: string, callback: (eventData: any) => void) {
      window.addEventListener(event, callback);
      this.listeners[event] = callback 
    }
  
    off(event: string) {
      window.removeEventListener(event, this.listeners[event]);
    }
}
  