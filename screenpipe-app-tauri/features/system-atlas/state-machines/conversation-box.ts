import { ActorRefFrom, assign, setup } from "xstate"

const conversationBoxMachine = setup({
    types: {
        events: {} as {
            type: 'UPDATE', 
            payload: {
                button: Array<{
                    shiny: boolean,
                    label: string,
                    event: {type: string},
                    variant: string,
                    size: string
                }>,
                textBox: {
                    id: number,
                    text: undefined
                },
                layout?: 'horizontal' | 'veritcal',
                process?: {
                    skippable: boolean
                }
            }
        } | {type: "LOADING" | "IDLE" | "NEXT_STEP" | "HIDDEN" | "TYPING_ANIMATION_DONE" | "SKIP" },
        context: {} as {
            textBox: {
                id: number,
                text: string | undefined
            },
            button: Array<{
                shiny?: boolean,
                label: string,
                event: {type: string},
                variant: string,
                size: string
            }>,
            layout: 'horizontal' | 'veritcal',
            process: {
                skippable: boolean
            }
        }
    }
}).createMachine({
    context: {
        textBox:{
            id: 0,
            text: undefined
        },
        button: [{
            shiny: false,
            label: 'next',
            event: {type: 'NEXT'},
            variant: 'default',
            size: 'default',
        }],
        layout: 'horizontal',
        process: {
            skippable: true
        }
    },
    type: 'parallel',
    states: {
        text: {
            initial: 'typing',
            states: {
                typing: {},
                idle: {}
            },
            on: {
                TYPING_ANIMATION_DONE: '.idle',
                UPDATE: {
                    target: ['.typing'],
                    actions: [
                        assign({
                            button: ({ event }) => event.payload.button
                        }),
                        assign({
                            textBox: ({ event }) => event.payload.textBox
                        }),
                        assign({
                            layout: ({ event }) => event.payload.layout ? event.payload.layout : 'horizontal'
                        }),
                        assign({
                            process: ({ event }) => event.payload.process ? event.payload.process : {
                                skippable: true
                            }
                        })
                    ],
                },
            }
        },
        buttons: {
            type: 'parallel',
            states: {
                process: {
                    initial: 'idle',
                    states: {
                        idle:{},
                        loading:{},
                        disabled: {}
                    },
                    on: {
                        LOADING: '.loading',
                        IDLE: '.idle',
                        NEXT_STEP: '.idle',
                    }
                },
                visibility: {
                    initial: 'hidden',
                    states: {
                        hidden: {},
                        visible: {}
                    },
                    on: {
                        NEXT_STEP: '.hidden',
                        TYPING_ANIMATION_DONE: '.visible'
                    }
                }
            },
        },
    },
    on: {
        '*': {
            description: 'any unrecognized event should be sent to the orchestrator state machine',
            actions: [
                ({ system, event }) =>{
                    system.get('orchestrator').send(event)
                }
            ]
        }
    }
})

export type ConversationBoxMachineType = ActorRefFrom<typeof conversationBoxMachine>
export default conversationBoxMachine