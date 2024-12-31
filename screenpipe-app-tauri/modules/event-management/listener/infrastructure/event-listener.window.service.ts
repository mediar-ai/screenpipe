import { EventListenerService } from "../interfaces/event-listener.service.interface";

export class WindowEventListener implements EventListenerService {
    private listeners: Record<string, (eventData: any) => void> = {}

    on(event: string, listener: (eventData: any) => void) {
      window.addEventListener(event, listener);
      this.listeners[event] = listener
    }
  
    off(event: string) {
      window.removeEventListener(event, this.listeners[event]);
    }
}
  