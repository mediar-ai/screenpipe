export type ScreenpipeAppEvent = {
    detail: string 
}

export interface EventEmitter {
    emit(event: string, data: string): void;
}
  