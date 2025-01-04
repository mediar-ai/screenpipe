import { EventEmitter } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";
import { emit } from "@tauri-apps/api/event";

export class TauriEventEmitter implements EventEmitter {
  emit(event: string, data: string): void {
    emit(event, {detail: data})
  }
}