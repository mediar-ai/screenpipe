import { sendTo } from "xstate"
import { AvailablePeripheralDevices, AvailablePeripheralDevicesEnum } from "../../types/available-devices"

type PermissionsConvoBoxContent = Record<AvailablePeripheralDevicesEnum, { nextDevice: any, entry: any, denied: any }>

const permissionsConvoBoxContent: PermissionsConvoBoxContent = {
    [AvailablePeripheralDevices.microphone]: {
        nextDevice: AvailablePeripheralDevices.accessibility,
        entry: { 
            type:'UPDATE',
            payload: {
                textBox: {
                    id: 2,
                    text: 'screenpipe needs microphone access permissions to enable audio recording and transcription. while recording is at your discretion, granting the required permission is necessary to use this feature.',
                },
                button:[{
                    variant: 'default',
                    size: 'default',
                    label: 'enable mic recording',
                    event: {type: 'REQUEST'}
                }],
            }
        },
        denied: { 
            type:'UPDATE', 
            payload: {
                textBox:{
                    id: 3,
                    text: 'looks like you\'ve denied microphone access permissions in the past. to enable them please visit System Preferences > Privacy > Screen Recording and enable screenpipe.',
                },
                button:[{
                    event: {type: 'SKIP'},
                    variant: 'default',
                    size: 'default',
                    label: 'continue',
                }],
                process: {
                    skippable: false
                }
            }
        }
    },
    [AvailablePeripheralDevices.accessibility]: {
        nextDevice: AvailablePeripheralDevices.screenRecording,
        entry: { 
            type:'UPDATE', 
            payload: {
                textBox:{
                    id: 4,
                    text: 'screenpipe needs accessibility permissions to capture activity of selected windows.  while recording is at your discretion, granting the required permission is necessary to use this feature',
                },
                button:[{
                    label: 'enable screen recording',
                    event: {type: 'REQUEST'},
                    variant: 'default',
                    size: 'default',
                    skip: true
                }],
            }
        },
        denied:  { 
            type:'UPDATE', 
            payload: {
                textBox:{
                    id: 3,
                    text: 'looks like you\'ve denied accessibility permissions in the past. to enable them please visit System Preferences > Privacy > Screen Recording and enable screenpipe.',
                },
                button:[{
                    event: {type: 'SKIP'},
                    variant: 'default',
                    size: 'default',
                    label: 'continue',
                }],
                process: {
                    skippable: false
                }
            }
        }
    },
    [AvailablePeripheralDevices.screenRecording]: {
        nextDevice: '#core_models',
        entry: { 
            type:'UPDATE', 
            payload: {
                textBox:{
                    id: 3,
                    text: 'screenpipe needs screen recording permissions to capture precise mouse movements and hotkeys. while recording is at your discretion, granting the required permission is necessary to use this feature.',
                },
                button:[{
                    event: {type: 'REQUEST'},
                    variant: 'default',
                    size: 'default',
                    label: 'grant accessibility permissions',
                    skip: true,
                }],
            }
        },
        denied: { 
            type:'UPDATE', 
            payload: {
                textBox:{
                    id: 3,
                    text: 'looks like you\'ve denied screen recording permissions in the past. to enable them please visit System Preferences > Privacy > Screen Recording and enable screenpipe.',
                },
                button:[{
                    event: {type: 'SKIP'},
                    variant: 'default',
                    size: 'default',
                    label: 'continue',
                }],
                process: {
                    skippable: false
                }
            }
        }
    },
    
}

export function generatePermissionsStates(device: AvailablePeripheralDevicesEnum) {
    return {
        entry: [   
            sendTo('convoBoxMachine', permissionsConvoBoxContent[device].entry, { delay: 500 }),
            sendTo('peripheralDevicesMachine', { type: 'PENDING', device: AvailablePeripheralDevices[device] })
        ],
        on: {
            'REQUEST': {
                actions: [
                    sendTo('convoBoxMachine',{type:'LOADING'}),
                    sendTo('peripheralDevicesMachine', { type: 'REQUEST', device: AvailablePeripheralDevices[device] })
                ]
            },
            'CHECK': {
                actions: sendTo('peripheralDevicesMachine',{type: 'CHECK', device: AvailablePeripheralDevices[device] })
            },
            'SKIP': {
                actions: [
                    sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                    sendTo('peripheralDevicesMachine',{ type: 'SKIP', device: AvailablePeripheralDevices[device] }),
                ],
                target: permissionsConvoBoxContent[device].nextDevice
            },
            'GRANTED': {
                target: permissionsConvoBoxContent[device].nextDevice,
                actions: sendTo('convoBoxMachine',{type:'NEXT_STEP'})
            },
            'DENIED': {
                actions: [
                    sendTo('convoBoxMachine',{type:'NEXT_STEP'}),
                    sendTo('convoBoxMachine', permissionsConvoBoxContent[device].denied, {delay:500}),
                ]
            }
        }
    }
}