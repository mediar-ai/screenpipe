import { ScreenpipeAppEvent } from "../../emitter/interfaces/event-emitter.service.interface";
import { EventListenerCallback, EventListenerService } from "../interfaces/event-listener.service.interface";

export class WindowEventListener implements EventListenerService {
    private listeners: Record<string, (event: CustomEvent<ScreenpipeAppEvent>) => void> = {}

    on(event: string, callback: EventListenerCallback) {
      // Bit of typescript juggling
      // Refer: https://github.com/microsoft/TypeScript/issues/28357
      // TODOO: implement a proper EventTargetObject with custom event map
      const innerCallback = (event: CustomEvent<ScreenpipeAppEvent>) => {
        callback(event.detail)
      }

      window.addEventListener(event, innerCallback as EventListener);
      this.listeners[event] = innerCallback
    }
  
    off(event: string) {
      window.removeEventListener(event, this.listeners[event] as EventListener);
    }
}
  