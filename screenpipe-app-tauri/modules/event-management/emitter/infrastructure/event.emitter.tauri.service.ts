import { EventEmitter } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";
import { emit } from "@tauri-apps/api/event";

export class TauriEventEmitter implements EventEmitter {
  emit(event: string, data: any): void {
    emit(event, data)
  }
}