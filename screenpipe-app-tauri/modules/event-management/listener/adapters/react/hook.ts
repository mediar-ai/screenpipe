import { useEffect, useState } from "react";
import { EventListenerService } from "../../interfaces/event-listener.service.interface";

export function useEventListener(event: string, listener: EventListenerService) {
    const [data, setData] = useState(null);

    useEffect(() => {
        // Listener function that updates state with the event data
        const handleEvent = (eventData: any) => {
            setData(eventData);
        };

        // Subscribe to the event
        listener.on(event, handleEvent);

        // Cleanup listener when the component unmounts
        return () => {
        listener.off(event);
        };
    }, [event, listener]); // Re-run effect if the event or emitter changes

    return data;
}