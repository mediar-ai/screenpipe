import { assign, createActor, fromPromise, sendParent, sendTo, setup, spawnChild } from 'xstate';
import conversationBoxMachine from '@/features/system-atlas/state-machines/conversation-box';
import screenpipeLogoMachine from '@/features/system-atlas/state-machines/screenpipe-logo';
import { AvailablePeripheralDevices, AvailablePeripheralDevicesEnum } from '@/modules/peripheral-devices/types/available-devices';
import { generatePermissionsStates } from '@/modules/peripheral-devices/adapters/state-machine/onboarding-flow.utils';
import peripheralDevicesMachine from '@/modules/peripheral-devices/adapters/state-machine/management.state-machine';
import downloadModelsUseCase from '@/modules/screenpipe-cli/use-cases/download-local-models.use-case';
import spawnScreenpipeUseCase from '@/modules/screenpipe-cli/use-cases/spawn-screenpipe.use-case';
import listenToEventUseCase from '@/modules/event-management/listener/use-cases/listen-to-event.use-case';
import { ScreenpipeAppEvent } from '@/modules/event-management/emitter/interfaces/event-emitter.service.interface';
import { check } from '@tauri-apps/plugin-updater';

const modelDownload = fromPromise(async ({ input }: { input: { fileName: string, parent: any }, system: any }) => {
    function callback(event: ScreenpipeAppEvent) {
        if(event.detail.includes('SileroVad Model downloaded')) {
            input.parent.send({type: 'PROGRESS_UPDATE', payload: { silero: 'healthy', whisper: 'healthy' }})
        }
    }

    const listener = listenToEventUseCase('model-download-update', callback)
    await downloadModelsUseCase({enableBeta: false})

    // TODOO: fix react state management, looks like terminal text display is rerendering unnecessarily
    // listener.off(listener.event)
})

const screenpipeEngineStartup = fromPromise(async () => {
    await spawnScreenpipeUseCase()
})

const updateChecker = fromPromise<boolean | undefined>(async ({}) => {
    const response =  await check()
    return response?.available
})

export const screenpipeOnboardingFlow = setup({
    types:{
        events: {} as {type:'NEXT'|'ANIMATION_DONE'|'CHECK'|'SKIP'|'REQUEST'|'YES'|'NO'}|{type:'PROGRESS_UPDATE',payload:any}|{type:'ACTIVATE'}|{type:'UPDATE',payload:any}
    },
    actors: {
        conversationBoxMachine,
        peripheralDevicesMachine,
        screenpipeLogoMachine,
        modelDownload,
        screenpipeEngineStartup,
        updateChecker
    }
}).createMachine({
    initial:'core_models',
    entry: [
        spawnChild('conversationBoxMachine', { id:'convoBoxMachine', systemId: 'convoBoxMachine' }),
        spawnChild('screenpipeLogoMachine', { id:'screenpipeLogoMachine', systemId: 'screenpipeLogoMachine' }),
        spawnChild('peripheralDevicesMachine', { id:'peripheralDevicesMachine', systemId: 'peripheralDevicesMachine' }),
    ],
    context: {
        updateAvailable: false,
        ai: {
            llama: 'asleep',
            openai: 'asleep',
            perplexity: 'asleep',
            mixtral: 'asleep'
        },
        localModels: {
            silero: 'asleep',
            whisper: 'asleep'
        }
    },
    states: {
        welcome: {
            entry: [
                sendTo(
                    'convoBoxMachine', 
                    { 
                        type:'UPDATE', 
                        payload: {
                            textBox:{
                                id: 1,
                                text: 'this onboarding guide will walk you through the essentials, so you can hit the ground running and make the most of screenpipe.',
                            },
                            button:[{
                                shiny: true,
                                label: 'let\'s get started!',
                                event: {type: 'NEXT'},
                                state: 'default',
                                variant: 'default',
                                size: 'default'
                            }],
                            layout: 'vertical',
                            process: {
                                skippable: false
                            }
                        }
                    }
                ),
            ],
            on:{
                NEXT: {
                    actions: sendTo('convoBoxMachine', {type:'NEXT_STEP'}),
                    target: 'introduction'
                }
            },
        },
        introduction: {
            entry: [
                sendTo(
                    'convoBoxMachine', 
                    { 
                        type:'UPDATE', 
                        payload: {
                            textBox:{
                                id: 1,
                                text: 'first, you need to grant screenpipe some permissions.',
                            },
                            button:[{
                                label: 'continue',
                                event: {type: 'NEXT'},
                                state: 'default',
                                variant: 'default',
                                size: 'default'
                            }],
                            process: {
                                skippable: false
                            }
                        }
                    }
                ),
            ],
            on:{
                NEXT: {
                    actions: sendTo('convoBoxMachine', {type:'NEXT_STEP'}),
                    target: 'permissions'
                }
            },
        },
        permissions: {
            initial: AvailablePeripheralDevices.microphone,
            states: Object.keys(AvailablePeripheralDevices).reduce((acc, key) => {
                acc[key] = generatePermissionsStates(key as AvailablePeripheralDevicesEnum)
                return acc
            }, {} as any)
        },
        core_models: {
            tags: ['showTerminalLogs'],
            id: 'core_models',
            initial: 'introduction',
            on: {
                NEXT: 'backend',
                SKIP: 'backend'
            },
            invoke: {
                id: 'updateChecker',
                src: 'updateChecker',
                onDone: {
                    actions: [
                        assign({
                            updateAvailable: ({event}) => event.output
                        })
                    ]
                }
            },
            states: {
                introduction: {
                    description:'objective of this step is to contextualize the user',
                    entry: [   
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 5,
                                    text: 'screenpipe can extract text from your screen and transcribe microphone input while capturing your activity. to ensure your privacy, everything is processed on your device using ai models that we need to download and set up for you.',
                                },
                                button: [
                                    {
                                        variant: 'default',
                                        size: 'default',
                                        skip: false,
                                        label: 'download models',
                                        event: {type: 'NEXT'}
                                    },
                                ],
                            }
                        },{delay:500}),
                        assign({
                            ai: ({ context }) => {
                                return {
                                    ...context.ai,
                                    llama: 'pending' 
                                }
                            },
                        }),
                    ],
                    on: {
                        'NEXT': [
                            {
                                guard: ({ context }) => !context.updateAvailable,
                                target: ['chineseMirrorToggle'],
                                actions: [
                                    sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                                ]
                            },
                            {
                                target: ['update'],
                                actions: [
                                    sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                                ]
                            }
                        ]
                    }
                },
                update: {
                    initial: 'intro',
                    states: {
                        intro :{
                            description: 'objective of this step is to update screenpipe before setting up models. failing to do so results in unexpected behaviour when attempting to run screenpipe setup command.',
                            entry: [   
                                sendTo('convoBoxMachine', {  type:'UPDATE',
                                    payload: {
                                        textBox: {
                                            id: 61,
                                            text: 'looks like you\'re running an outdated version of screenpipe. to download and configure screenpipe\'s core models properly you first need to update the app.',
                                        },
                                        button: [
                                            {
                                                variant: 'default',
                                                size: 'default',
                                                label: 'update app',
                                                event: {type: 'UPDATE'}
                                            },
                                        ],
                                        process: {
                                            skippable: true
                                        }
                                    }
                                },{delay:500}),
                            ],
                            on: {
                                'UPDATE': {
                                    actions: [
                                        sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                    ],
                                    target: 'updateScreenpipe'
                                },
                                'skip': {
                                    actions: [
                                        sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                    ],
                                    target: '#backend'
                                },
                            } 
                        },
                        updateScreenpipe: {}
                    }
                },
                chineseMirrorToggle: {
                    description: 'objective of this step is to let user choose whether to download models from a chinese mirror or not',
                    entry: [   
                        sendTo('convoBoxMachine', {  type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 6,
                                    text: 'would you like to use a chinese mirror to download the models?',
                                },
                                button: [
                                    {
                                        variant: 'default',
                                        size: 'default',
                                        skip: false,
                                        label: 'no',
                                        event: {type: 'NO'}
                                    },
                                    {
                                        variant: 'secondary',
                                        size: 'default',
                                        skip: true,
                                        label: 'yes',
                                        event: {type: 'YES'}
                                    },
                                ],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        'YES': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({ chineseMirror: true }),
                            ],
                            target: 'download'
                        },
                        'NO': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({ chineseMirror: false }),
                            ],
                            target: 'download'
                        },
                    }
                },
                download: {
                    entry: [   
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 7,
                                    text: "we're downloading two ai models for you. this may take a few minutes depending on your internet connection.",
                                },
                                button: [
                                    {
                                        variant: 'secondary',
                                        size: 'default',
                                        skip: true,
                                        label: 'okay',
                                        event: {type: 'YES'}
                                    }
                                ],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                        sendTo('convoBoxMachine', {type:'LOADING'}),
                        assign({
                            localModels: {
                                silero: 'pending',
                                whisper: 'pending'
                            }
                        })
                    ],
                    invoke: {
                        id: 'aiModelDownload',
                        src: 'modelDownload',
                        input: ({ self, context }) => ({
                            parent: self,
                            fileName: 'model 1',
                            chineseModel: context.chineseModel
                        }),
                        onDone: {
                            target: 'downloadComplete',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({
                                    localModels: {
                                        silero: 'healthy',
                                        whisper: 'healthy'
                                    }
                                }),
                            ],
                        },
                        onError: {
                            target: 'error',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({
                                    localModels: {
                                        silero: 'denied',
                                        whisper: 'denied'
                                    }
                                }),
                            ],
                        },
                    },
                    on: {
                        PROGRESS_UPDATE: {
                            actions: [
                                assign({
                                    localModels: ({context, event}) => {
                                        return {
                                            ...context.localModels,
                                            ...event.payload
                                        }
                                    }
                                })
                            ]
                        }
                    }
                },
                error: {
                    entry: [
                        sendTo('convoBoxMachine', { type: 'IDLE' }),
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 70,
                                    text: "there was an issue while downloading the local models. would you like to try again?",
                                },
                                button: [
                                    {
                                        variant: 'secondary',
                                        size: 'default',
                                        label: 'yes',
                                        event: {type: 'NEXT'}
                                    }
                                ],
                                process: {
                                    skippable: true 
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        NEXT: {
                            target: "chineseMirrorToggle",
                            actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                        },
                        SKIP: {
                            target: '#appstore',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({
                                    localModels: {
                                        silero: 'skipped',
                                        whisper: 'skipped'
                                    }
                                })
                            ]
                        }
                    }
                },
                downloadComplete: {
                    entry: [
                        sendTo('convoBoxMachine', { type: 'IDLE' }),
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 7,
                                    text: "both models have been downloaded and initiated successfully.",
                                },
                                button: [
                                    {
                                        variant: 'secondary',
                                        size: 'default',
                                        skip: true,
                                        label: 'okay',
                                        event: {type: 'NEXT'}
                                    }
                                ],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        'NEXT': {
                            target: "#backend",
                            actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                        }
                    }
                }
            }
        },
        backend: {
            description: 'objective of this step is to initiate screenpipe\'s engine',
            id: 'backend',
            initial: 'intro',
            states: {
                intro: {
                    entry: [
                        sendTo('convoBoxMachine', { type: 'IDLE' }),
                        sendTo('screenpipeLogoMachine', { type: 'ACTIVATE' }),
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 8,
                                    text: 'now we need to start screenpipe as a background service. this action will allow the engine to run efficently in the background while you continue with your regular activity.',
                                },
                                button:  [{
                                    variant: 'default',
                                    size: 'default',
                                    skip: true,
                                    label: 'start screenpipe',
                                    event: {type: 'NEXT'}
                                }],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        NEXT: {
                            target: 'initiating',
                            actions: [
                                sendTo('convoBoxMachine', {  type: 'NEXT_STEP' })
                            ]
                        },
                        SKIP: '#appstore'
                    }
                },
                initiating: {
                    entry: [
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 9,
                                    text: 'we\'re starting screenpipe for you. please stand by.',
                                },
                                button: [
                                    {
                                        variant: 'secondary',
                                        size: 'default',
                                        skip: true,
                                        label: 'okay',
                                        event: {type: 'YES'}
                                    },
                                ],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                        sendTo('convoBoxMachine',{type:'LOADING'}),
                        sendTo('screenpipeLogoMachine', { type: 'LOADING' }),
                    ],
                    invoke: {
                        id: 'startScreenpipe',
                        src: 'screenpipeEngineStartup',
                        onDone: {
                            target: 'intermission',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                            ],
                        }
                    },
                },
                intermission: {
                    entry: [
                        sendTo('screenpipeLogoMachine', { type: 'ANIMATE' }),
                    ],
                    on: {
                        "ANIMATION_DONE": {
                            target: 'complete',
                            actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                        }
                    }
                },
                complete: {
                    entry: [
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 10,
                                    text: 'screenpipe is now running as a background service!',
                                },
                                button:  [{
                                    variant: 'default',
                                    size: 'default',
                                    skip: true,
                                    label: 'continue',
                                    event: {type: 'NEXT'}
                                }],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        NEXT: {
                            target: '#appstore',
                            actions: [
                                sendTo('screenpipeLogoMachine', {type: 'RUNNING'}),
                                sendTo('convoBoxMachine', {  type: 'NEXT_STEP' })
                            ]
                    }
                    }
                }
            },
        },
        ai: {},
        appstore: {
            id: 'appstore',
            initial: 'intro',
            states: {
                intro: {
                    entry: [
                        assign({
                            appstore: 'pending'
                        }),
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 9,
                                    text: 'screenpipe can be extended through pipes, which are versatile plugins that streamline workflow automation for analyzing and managing captured data.',
                                },
                                button:  [{
                                    variant: 'default',
                                    size: 'default',
                                    skip: true,
                                    label: 'nice!',
                                    event: {type: 'NEXT'}
                                }],
                            }
                        },{delay:500}),
                    ],
                    on: {
                        NEXT: {
                            target: 'install',
                            actions: [
                                assign({
                                    appstore: 'pending'
                                }),
                                sendTo('convoBoxMachine', {  type: 'NEXT_STEP' })
                            ]
                        },
                        SKIP: '#done'
                    }
                },
                install: {
                    entry: [
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 10,
                                    text: 'you can install core and community pipes from our pipestore at any moment.',
                                },
                                button:  [{
                                    variant: 'default',
                                    size: 'default',
                                    skip: true,
                                    label: 'visit the pipestore',
                                    event: { type: 'NEXT' }
                                }],
                                process: {
                                    skippable: false
                                }
                            }
                        },{delay:500}),
                    ],
                    on: {
                        NEXT: {
                            actions: [
                                sendTo('convoBoxMachine', {  type: 'NEXT_STEP' })
                            ],
                            target: '#done'
                        },
                        SKIP: {
                            actions: sendTo('convoBoxMachine', {  type: 'NEXT_STEP' }),
                            target: '#done'
                        }
                    }
                }
            },
        },
        search:{},
        user:{},
        done: {
            id:'done',
            entry: [
                sendTo('convoBoxMachine', { 
                    type:'UPDATE',
                    payload: {
                        textBox: {
                            id: 11,
                            text: 'screenpipe has been successfully configured! you\'re all set.',
                        },
                        button:  [{
                            variant: 'default',
                            size: 'default',
                            skip: true,
                            label: 'continue to dashboard',
                            event: {type: 'NEXT'}
                        }],
                    }
                },{delay:500}),
            ],
        }
    },
})

export const screenpipeOnboardingMachine = createActor(screenpipeOnboardingFlow, {systemId:'orchestrator'});
screenpipeOnboardingMachine.start()