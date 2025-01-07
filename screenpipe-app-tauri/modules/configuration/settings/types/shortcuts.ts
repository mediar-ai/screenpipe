export const AvailableShortcuts = {
    SHOW_SCREENPIPE: "show_screenpipe",
    START_RECORDING: "start_recording",
    STOP_RECORDING: "stop_recording",
} as const

export type AvailableShortcutsEnum = (typeof AvailableShortcuts)[keyof typeof AvailableShortcuts]