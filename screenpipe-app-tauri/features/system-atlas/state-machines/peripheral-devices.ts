import { ActorRefFrom, fromPromise, sendTo, setup } from "xstate";
import { AvailablePeripheralDevices } from '../peripheral-devices/data-transfer-objects/available-devices';

let isActive=false
const checkPermissions = (device: AvailablePeripheralDevices) =>{
    return  new Promise<boolean>((resolve) => {
        setTimeout(() => {
            resolve(isActive)
        }, 2000);
    })
}

const requestAccess = (device: string) =>{
    window.alert('granting permission to access: '+device)
    isActive=true
    return  new Promise<boolean>((resolve) => {
        setTimeout(() => {
            resolve(false)
        }, 2000);
    })
}

const peripheralDevicesMachine = setup({
    types: {
    },
    actors: {
        checkPermission: fromPromise(async ({input}: {input: {type:string}}) => {
            const response = await checkPermissions(input.type)
            return response
        }),
        requestAccess: fromPromise(async ({input}: {input: {type:string}}) => {
            const response = await requestAccess(input.type)
            return response
        }),
    }
}).createMachine({
    description: 'state machine that keeps status and manages input device access.',
    type: 'parallel',
    states: {
        mic: {
            initial: 'idle',
            states: {
                idle: {},
                pending: {},
                checking: {
                    invoke: {
                        src: 'checkPermission',
                        input: { type: 'mic' },
                        onDone: [
                            {
                                guard: ({event}) => event.output,
                                target: 'healthy',
                            },
                            {
                                target: 'unhealthy'
                            }
                        ]
                    }
                },
                healthy: {
                    entry: [
                        sendTo(({ system }) => system.get('orchestrator'), {type: "HEALTHY"}),
                    ]
                },
                unhealthy: {},
                requesting : {
                    invoke: {
                        src: 'requestAccess',
                        input: { type: 'mic' },
                        onDone: 'checking'
                    }
                },
                skipped: {}
            },
            on: {
                "CHECK_MIC": ".checking",
                "REQUEST_MIC": ".requesting",
                "PENDING_MIC": ".pending",
                "SKIP_MIC": ".skipped"
            }
        },
        monitor: {
            initial: 'idle',
            states: {
                idle: {},
                pending: {},
                checking: {
                    invoke: {
                        src: 'checkPermission',
                        input: { type: 'monitor' },
                        onDone: [
                            {
                                guard: ({event}) => event.output,
                                target: 'healthy',
                            },
                            {
                                target: 'unhealthy'
                            }
                        ]
                    }
                },
                healthy: {
                    entry: [
                        sendTo(({ system }) => system.get('orchestrator'), {type: "HEALTHY"}),
                    ]
                },
                unhealthy: {},
                requesting : {
                    invoke: {
                        src: 'requestAccess',
                        input: { type: 'monitor' },
                        onDone: 'checking'
                    }
                },
                skipped: {}
            },
            on: {
                "CHECK_MONITOR": ".checking",
                "REQUEST_MONITOR": ".requesting",
                "PENDING_MONITOR": ".pending",
                "SKIP_MONITOR": ".skipped"
            }
        },
        accessibility: {
            initial: 'idle',
            states: {
                idle: {},
                pending: {},
                checking: {
                    invoke: {
                        src: 'checkPermission',
                        input: { type: 'accessibility' },
                        onDone: [
                            {
                                guard: ({event}) => event.output,
                                target: 'healthy',
                            },
                            {
                                target: 'unhealthy'
                            }
                        ]
                    }
                },
                healthy: {
                    entry: [
                        sendTo(({ system }) => system.get('orchestrator'), {type: "HEALTHY"}),
                    ]
                },
                unhealthy: {},
                requesting : {
                    invoke: {
                        src: 'requestAccess',
                        input: { type: 'accessibility' },
                        onDone: 'checking'
                    }
                },
                skipped: {}
            },
            on: {
                "PENDING_ACCESSIBILITY": ".pending",
                "REQUEST_ACCESSIBILITY": ".requesting",
                "CHECK_ACCESSIBILITY": ".checking",
                "SKIP_ACCESSIBILITY": ".skipped"
            }
        }
    },
});

export type PeripheralDevicesMachineType = ActorRefFrom<typeof peripheralDevicesMachine>
export default peripheralDevicesMachine