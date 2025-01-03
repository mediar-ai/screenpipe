import { useEffect, useState } from "react";
import { EventListenerService } from "../../interfaces/event-listener.service.interface";
import { reactLogPresenter, ReactLogPresenterOutput } from '../../../utils/utils';

export function useEventListener(event: string, listener: EventListenerService) {
    const [data, setData] = useState<ReactLogPresenterOutput | null>(null);

    useEffect(() => {
        // Listener function that updates state with the event data
        const handleEventCallback = (eventData: any) => {
            const parsedEvent = reactLogPresenter(eventData)
            setData(parsedEvent);
        };

        // Subscribe to the event
        listener.on(event, handleEventCallback);

        // Cleanup listener when the component unmounts
        return () => {
            listener.off(event);
        };
    }, [event, listener]); // Re-run effect if the event or emitter changes

    return data;
}