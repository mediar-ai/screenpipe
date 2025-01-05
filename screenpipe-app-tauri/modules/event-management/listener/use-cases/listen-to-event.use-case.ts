import { ScreenpipeAppEvent } from "../../emitter/interfaces/event-emitter.service.interface"
import { WindowEventListener } from "../infrastructure/event-listener.window.service"
import { EventListenerService } from "../interfaces/event-listener.service.interface"

// TODOO: use generic to merge with ReactEventListenerLogCallback
export type EventListenerCallback = (event: ScreenpipeAppEvent) => void

type ListenToEventUseCaseReturnType = {
    off: EventListenerService['off'],
    event: string
}

function listenToEventUseCase(event: string, callback: EventListenerCallback):  ListenToEventUseCaseReturnType {
    const eventListener = new WindowEventListener()

    eventListener.on(event, callback)

    return { off: eventListener.off, event }
}

export default listenToEventUseCase