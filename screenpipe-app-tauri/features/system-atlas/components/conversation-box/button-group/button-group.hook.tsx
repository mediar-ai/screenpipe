import { ConversationBoxMachineType } from "@/features/system-atlas/state-machines/conversation-box";
import { shallowEqual, useSelector } from "@xstate/react";

/**
 * @param {ConversationBoxMachineType} convoBoxMachine - convo box xstate machine actor reference.
 * @description hook exposes all necessary information to interact and render convobox button group
 * @returns
 */
export default function useConvoBoxButtonGroup(convoBoxMachine: ConversationBoxMachineType) {
    const buttons = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.context.button
    }, shallowEqual)

    const isStepSkippable = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.context.process.skippable
    })

    const isLoading = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.matches({ buttons: { process: 'loading' }})
    })

    const isDisabled = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.matches({ buttons: { process: 'disabled' }})
    })

    const isButtonGroupHidden = useSelector(convoBoxMachine, (snapshot) => {
        return snapshot.matches({ buttons: { visibility: 'hidden' }})
    })

    function sendEvent(event: any) {
        convoBoxMachine.send(event)
    }

    function skipEvent() {
        convoBoxMachine.send({type:'SKIP'})
    }

    return {
        buttons,
        isButtonGroupHidden,
        isStepSkippable,
        isLoading,
        isDisabled,
        sendEvent,
        skipEvent
    }
}

export type UseConvoBoxButtonGroupResult = ReturnType<typeof useConvoBoxButtonGroup>

