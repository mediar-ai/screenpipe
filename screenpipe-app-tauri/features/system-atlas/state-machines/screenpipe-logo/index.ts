import { ActorRefFrom, assign, sendParent, setup } from "xstate";
import animationController from './animation-controller';

const screenpipeLogoMachine = setup({
    types:{
        events: {} as { 
            type: 'DEFAULT' | 'ACTIVATE' | 'ANIMATE'| 'RUNNING' | 'DONE' 
        } | { 
            type: 'UPDATE', 
            payload: {
                duration: number, 
                strokeWidth: number, 
                size: number
            }
        },
        context: {} as {
            strokeWidth: number, 
            duration: number, 
            size: number 
        },
    },
    actors:{
        animationController
    },
}).createMachine({
    description: 'state machine that orchestrates rendering of screenpipe\'s logo',
    initial: 'default',
    context: {
      strokeWidth: 1.5,
      duration: 0.9,
      size: 200
    },
    states: {
        default: {
            tags: ['border']
        },
        active: {
            tags: ['border', 'greenBorder']
        },
        loading:{
            description: 'set to indicate screenpipe is being initiated.',
            tags: ['borderBeam', 'border', 'greenBorder']
        },
        emphasisAnimation: {
            description: 'set to indicate screenpipe has been successfully initiated. state is transitory, used to control the flow of the emphasis animation.',
            initial: 'grow',
            states: {
                grow: {
                    tags: ['borderBeam', 'border', 'greenBorder'],
                    invoke: [
                        {
                            src:'animationController',
                            input: ({ context }) => context
                        },
                    ],
                    on: {
                        UPDATE: {
                            actions: assign({
                                strokeWidth: ({ event }) => event.payload.strokeWidth,
                                duration: ({ event }) => event.payload.duration,
                                size: ({ event }) => event.payload.size
                            })
                        },
                        DONE: 'glow'
                    },
                },
                glow: {
                    tags: ['borderBeam', 'neonGradient', 'border', 'expand'],
                    entry: [
                        sendParent({type:'ANIMATION_DONE'})
                    ],
                },
            }
        },
        running: {
            description: 'set to indicate screenpipe is runnng.',
            tags: ['neonGradient']
        }
    },
    on: {
      "DEFAULT": ".default",
      "ACTIVATE": ".active",
      "ANIMATE": ".emphasisAnimation",
      "LOADING": ".loading",
      "RUNNING": '.running'
    }  
});

export type ScreenpipeLogoMachineType = ActorRefFrom<typeof screenpipeLogoMachine>
export default screenpipeLogoMachine