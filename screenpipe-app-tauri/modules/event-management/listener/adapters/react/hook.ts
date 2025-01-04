import { useEffect, useState } from "react";
import { EventListenerService } from "../../interfaces/event-listener.service.interface";
import { ScreenpipeAppEvent } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";
import { reactLogPresenter, ReactLogPresenterOutput } from "@/modules/screenpipe-cli/adapters/react-log.presenter";

export type ReactEventListenerLogCallback = (event: ReactLogPresenterOutput) => void
export function useEventListener(event: string, listener: EventListenerService, callback?: ReactEventListenerLogCallback) {
    const [data, setData] = useState<ReactLogPresenterOutput | null>(null);

    useEffect(() => {
        const defaultHandleEventCallback = (eventData: ScreenpipeAppEvent) => {
            const parsedEvent = reactLogPresenter(eventData.detail)
            setData(parsedEvent);
        };

        const handleEventCallback = callback 
            ? (eventData: ScreenpipeAppEvent) => callback(reactLogPresenter(eventData.detail)) 
            : defaultHandleEventCallback
            
        listener.on(event, handleEventCallback);

        return () => {
            listener.off(event);
        };
    }, [event, listener]);

    return data;
}