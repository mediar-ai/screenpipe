import { EventEmitter } from "events";

declare global {
  var globalEventEmitter: EventEmitter | undefined;
}

export const eventEmitter = global.globalEventEmitter || new EventEmitter();

if (!global.globalEventEmitter) {
  global.globalEventEmitter = eventEmitter;
}
