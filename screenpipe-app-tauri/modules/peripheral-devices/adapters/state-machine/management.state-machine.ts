import { ActorRefFrom, assign, fromPromise, sendTo, setup } from "xstate";
import { AvailablePeripheralDevices, AvailablePeripheralDevicesEnum } from '@/modules/peripheral-devices/types/available-devices'
import { requestAccessUseCase } from "@/modules/peripheral-devices";
import checkPermissionStateUseCase from "@/modules/peripheral-devices/use-cases/check-permission-state.use-case";
import { OSPermissionsStatesPerDevice } from "@/modules/peripheral-devices/types/permission-state-per-device";

const checkPermission = fromPromise(async ({input}: {input: {device: AvailablePeripheralDevicesEnum}}) => {
    const permissionsState = await checkPermissionStateUseCase()

    // TODO: 
    // 1. Either create presenter or rs function to check one device only.
    // 2. Dirty state management. should sync PermissionState with state machine states.
    return  permissionsState[input.device]
})

const requestAccess = fromPromise(async ({input}: {input: {device:AvailablePeripheralDevicesEnum}}) => {
    await requestAccessUseCase(input.device)
})

const peripheralDevicesMachine = setup({
    types: {
        events: {} as { 
            type: "CHECK" | "REQUEST" | "PENDING" | "SKIP",
            device: AvailablePeripheralDevicesEnum
        },
        context: {} as {
            activeDevice: AvailablePeripheralDevicesEnum,
            permissionStatesPerDevice: OSPermissionsStatesPerDevice
        }
    },
    actors: {
        checkPermission,
        requestAccess 
    }
}).createMachine({
    description: 'state machine that keeps status and manages input device access.',
    context: {
        activeDevice: AvailablePeripheralDevices.microphone,
        permissionStatesPerDevice: {
            'accessibility': 'empty',
            'microphone': 'empty',
            'screenRecording': 'empty'
        }
    },
    initial: 'idle',
    states: {
        idle: {},
        checking: {
            invoke: {
                src: 'checkPermission',
                input: ({context}) => { return { device: context.activeDevice }},
                onDone: [
                    {
                      target: 'idle',
                      actions: [
                            ({event, system}) => {
                                system.get('orchestrator').send({type: event.output.toUpperCase()})
                            },
                            assign({
                                permissionStatesPerDevice: ({event, context}) => {
                                    // make copy to avoid context object mutation
                                    const newPermissionStatesPerDevice = { ...context.permissionStatesPerDevice }
                                    newPermissionStatesPerDevice[context.activeDevice] = event.output

                                    return {
                                        ...newPermissionStatesPerDevice,
                                    }   
                                }
                            }),
                        ]
                    },
                ]
            }
        },
        requesting : {
            invoke: {
                src: 'requestAccess',
                input: ({context}) => {return { device: context.activeDevice }},
                onDone: 'checking'
            }
        },
    },
    on: {
        "CHECK": {
            actions: assign({
                activeDevice: ({ event }) => event.device,
                permissionStatesPerDevice: ({context, event}) => {
                    // make copy to avoid context object mutation
                    const newPermissionStatesPerDevice = { ...context.permissionStatesPerDevice }
                    newPermissionStatesPerDevice[event.device] = 'pending'

                    return {
                        ...newPermissionStatesPerDevice,
                    }   
                }
            }),
            target: ".checking"
        },
        "REQUEST": {
            actions: assign({
                activeDevice: ({ event }) => event.device,
                permissionStatesPerDevice: ({context, event}) => {
                    // make copy to avoid context object mutation
                    const newPermissionStatesPerDevice = { ...context.permissionStatesPerDevice }
                    newPermissionStatesPerDevice[event.device] = 'pending'

                    return {
                        ...newPermissionStatesPerDevice,
                    }   
                }
            }),
            target: ".requesting",
        },
        "PENDING": {
            actions: assign({
                activeDevice: ({ event }) => event.device,
                permissionStatesPerDevice: ({context, event}) => {
                    // make copy to avoid context object mutation
                    const newPermissionStatesPerDevice = { ...context.permissionStatesPerDevice }
                    newPermissionStatesPerDevice[event.device] = 'pending'

                    return {
                        ...newPermissionStatesPerDevice,
                    }   
                }
            }),
        },
        "SKIP": {
            actions: assign({
                permissionStatesPerDevice: ({context, event}) => {
                    // make copy to avoid context object mutation
                    const newPermissionStatesPerDevice = { ...context.permissionStatesPerDevice }
                    newPermissionStatesPerDevice[event.device] = 'skipped'

                    return {
                        ...newPermissionStatesPerDevice,
                    }   
                }
            }),
        }
    }
});

export type PeripheralDevicesMachineType = ActorRefFrom<typeof peripheralDevicesMachine>
export default peripheralDevicesMachine