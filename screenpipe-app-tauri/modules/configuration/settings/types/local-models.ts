export const VadSensitivity = {
    low: 'low',
    medium: 'medium',
    high: 'high'
} as const

export type VadSensitivityEnym = (typeof VadSensitivity)[keyof typeof VadSensitivity]