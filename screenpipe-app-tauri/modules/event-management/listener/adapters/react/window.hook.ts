import { ReactEventListenerLogCallback, useEventListener } from "./hook";
import { WindowEventListener } from "../../infrastructure/event-listener.window.service";

export function useWindowEventLister(event: string, callback?: ReactEventListenerLogCallback) {
    const listener = new WindowEventListener()
    const data = useEventListener(event, listener, callback)

    return data
}