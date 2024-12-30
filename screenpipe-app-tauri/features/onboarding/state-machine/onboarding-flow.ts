import { assign, createActor, fromPromise, sendTo, setup, spawnChild } from 'xstate';
import conversationBoxMachine from '@/features/system-atlas/state-machines/conversation-box';
import screenpipeLogoMachine from '@/features/system-atlas/state-machines/screenpipe-logo';
import peripheralDevicesMachine from '@/features/system-atlas/state-machines/peripheral-devices';

const modelDownload = fromPromise(async ({ input }: { input: { fileName: string, parent: any }, system: any }) => {
    console.log(`Starting download: ${input.fileName}`);
  
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
  
        input.parent.send({
          type: 'PROGRESS_UPDATE',
          progress,
        });
  
        if (progress >= 100) {
          clearInterval(interval);
          console.log(`Finished download: ${input.fileName}`);
          
          resolve({
            type: 'DOWNLOAD_COMPLETE',
            output: `Downloaded ${input.fileName}`,
          });
        }
      }, 1000);
    });
})

const screenpipeEngineStartup = fromPromise(async () => {
    console.log(`Starting screenpipe`);
  
    return new Promise<void>((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
  
        if (progress >= 100) {
          clearInterval(interval);
          console.log(`initiated screenpipe successfully`);
          
          resolve();
        }
      }, 300);
    });
})

export const screenpipeOnboardingFlow = setup({
    types:{
        events: {} as {type:'NEXT'|'ANIMATION_DONE'|'CHECK'|'SKIP'|'REQUEST'|'YES'|'NO'}|{type:'PROGRESS_UPDATE',progress:number}|{type:'ACTIVATE'}|{type:'UPDATE',payload:any}
    },
    actors: {
        conversationBoxMachine,
        peripheralDevicesMachine,
        screenpipeLogoMachine,
        modelDownload,
        screenpipeEngineStartup
    }
}).createMachine({
    initial:'welcome',
    entry: [
        spawnChild('conversationBoxMachine', { id:'convoBoxMachine', systemId: 'convoBoxMachine' }),
        spawnChild('screenpipeLogoMachine', { id:'screenpipeLogoMachine', systemId: 'screenpipeLogoMachine' }),
        spawnChild('peripheralDevicesMachine', { id:'peripheralDevicesMachine', systemId: 'peripheralDevicesMachine' }),
    ],
    context: {
        ai: {
            llama: 'asleep',
            openai: 'asleep',
            perplexity: 'asleep',
            mixtral: 'asleep'
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
            initial:'mic',
            states: {
                mic: {
                    entry: [   
                        sendTo('convoBoxMachine', { 
                            type:'UPDATE',
                            payload: {
                                textBox: {
                                    id: 2,
                                    text: 'screenpipe needs mic access permissions to enable audio recording and transcription. while recording is at your discretion, granting the required permission is necessary to use this feature.',
                                },
                                button:[{
                                    variant: 'default',
                                    size: 'default',
                                    skip: true,
                                    label: 'enable mic recording',
                                    event: {type: 'REQUEST'}
                                }],
                            }
                        },{ delay: 500 }),
                        sendTo('peripheralDevicesMachine',{type: 'PENDING_MIC'})
                    ],
                    on: {
                        'REQUEST': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'LOADING'}),
                                sendTo('peripheralDevicesMachine',{type: 'REQUEST_MIC'})
                            ]
                        },
                        'CHECK': {
                            actions: sendTo('peripheralDevicesMachine',{type: 'CHECK_MIC'})
                        },
                        'SKIP': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                sendTo('peripheralDevicesMachine',{type: 'SKIP_MIC'}),
                            ],
                            target: 'keyboard'
                        },
                        'HEALTHY': {
                            target: 'keyboard',
                            actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                        }
                    }
                },
                keyboard: {
                    entry: [
                        sendTo('convoBoxMachine', { type:'UPDATE', 
                            payload: {
                                textBox:{
                                    id: 3,
                                    text: 'screenpipe needs accessibility permissions to capture precise mouse movements and hotkeys. while recording is at your discretion, granting the required permission is necessary to use this feature.',
                                },
                                button:[{
                                    event: {type: 'REQUEST'},
                                    variant: 'default',
                                    size: 'default',
                                    label: 'grant accessibility permissions',
                                    skip: true,
                                }],
                            }
                        },{delay:500}),
                        sendTo('peripheralDevicesMachine',{type: 'PENDING_ACCESSIBILITY'})
                    ],
                    on: {
                        'REQUEST': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'LOADING'}),
                                sendTo('peripheralDevicesMachine',{type: 'REQUEST_ACCESSIBILITY'})
                            ]
                        },
                        'CHECK': {
                            actions: sendTo('peripheralDevicesMachine',{type: 'CHECK_ACCESSIBILITY'})
                        },
                        'SKIP': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                sendTo('peripheralDevicesMachine',{type: 'SKIP_ACCESSIBILITY'}),
                            ],
                            target: 'monitor'
                        },
                        'HEALTHY': {
                            target: 'monitor',
                            actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                        }
                    }
                },
                monitor:{
                    entry: [
                        sendTo('convoBoxMachine', { type:'UPDATE', 
                            payload: {
                                textBox:{
                                    id: 4,
                                    text: 'screenpipe needs screen recording permissions to capture activity of selected windows.  while recording is at your discretion, granting the required permission is necessary to use this feature',
                                },
                                button:[{
                                    label: 'enable screen recording',
                                    event: {type: 'REQUEST'},
                                    variant: 'default',
                                    size: 'default',
                                    skip: true
                                }],
                            }
                        },{delay:500}),
                        sendTo('peripheralDevicesMachine',{type: 'PENDING_MONITOR'})
                    ],
                    on: {
                        'REQUEST': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'LOADING'}),
                                sendTo('peripheralDevicesMachine',{type: 'REQUEST_MONITOR'})
                            ]
                        },
                        'CHECK': {
                            actions: sendTo('peripheralDevicesMachine',{type: 'CHECK_MONITOR'})
                        },
                        'SKIP': {
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                sendTo('peripheralDevicesMachine',{type: 'SKIP_MONITOR'}),
                            ],
                            target: '#core_models'
                        },
                        'HEALTHY': {
                            target: '#core_models',
                            actions: [
                                ()=>console.log("CORE"),
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                            ]
                        }
                    }
                }
            },
        },
        core_models: {
            id: 'core_models',
            initial: 'introduction',
            on: {
                NEXT: 'backend',
                SKIP: 'backend'
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
                            ai: ({context,event}) => {
                                return {
                                    ...context.ai,
                                    llama: 'pending' 
                                }
                            },
                        }),
                    ],
                    on: {
                        'NEXT': {
                            target: 'chineseMirrorToggle',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'})
                            ]
                        }
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
                                    text: "we're downloading two ai models for you. this may take a few minutes depending on your internet connection",
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
                        sendTo('convoBoxMachine', {type:'LOADING'}, {delay: 300}),
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
                            target: '#backend',
                            actions: [
                                sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                                assign({
                                    ai: ({context,event}) => {
                                        return {
                                            ...context.ai,
                                            llama: 'healthy' 
                                        }
                                    },
                                }),
                            ],
                        }
                    },
                    on: {
                        PROGRESS_UPDATE: {
                            actions: assign({
                                    downloadProgress: ({event}) => event.progress
                                })
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
                        "ANIMATION_DONE": 'complete'
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