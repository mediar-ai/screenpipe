// comes from src-tauri/src/permissions.rs 
// pub enumOSPermissionStatus
export const PermissionsStates = {
    NOT_NEEDED: "NotNeeded",
    EMPTY: "Empty",
    GRANTED: "Granted",
    DENIED: "Denied",
} as const;
export type PermissionsStates = (typeof PermissionsStates)[keyof typeof PermissionsStates];

export const PermissionDevices = {
    SCREEN_RECORDING: "screenRecording",
    MICROPHONE: "microphone",
    ACCESSIBILITY: "accessibility",
} as const;
export type PermissionDevices = (typeof PermissionDevices)[keyof typeof PermissionDevices];

export type PermissionsStatesPerDevice = Record<PermissionDevices, PermissionsStates>;

