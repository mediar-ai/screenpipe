import { EventEmitter } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";

export class WindowEventEmitter implements EventEmitter {
  emit(event: string, data: any): void {
    const customEvent = new CustomEvent(event, { detail: data });
    window.dispatchEvent(customEvent);
  }
}