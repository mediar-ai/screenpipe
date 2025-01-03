import { useEventListener } from "./hook";
import { WindowEventListener } from "../../infrastructure/event-listener.window.service";

export function useWindowEventLister(event: string) {
    const listener = new WindowEventListener()
    const data = useEventListener(event, listener)

    return data
}