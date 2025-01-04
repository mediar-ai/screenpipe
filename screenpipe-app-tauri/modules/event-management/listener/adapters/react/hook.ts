import { useEffect, useState } from "react";
import { EventListenerService } from "../../interfaces/event-listener.service.interface";
import { reactLogPresenter, ReactLogPresenterOutput } from '../../../utils/utils';
import { ScreenpipeAppEvent } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";

export function useEventListener(event: string, listener: EventListenerService) {
    const [data, setData] = useState<ReactLogPresenterOutput | null>(null);

    useEffect(() => {
        const handleEventCallback = (eventData: ScreenpipeAppEvent) => {
            const parsedEvent = reactLogPresenter(eventData.detail)
            setData(parsedEvent);
        };

        listener.on(event, handleEventCallback);

        return () => {
            listener.off(event);
        };
    }, [event, listener]);

    return data;
}