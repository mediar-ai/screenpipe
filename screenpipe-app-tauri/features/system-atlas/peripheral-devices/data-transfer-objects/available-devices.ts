export const AvailablePeripheralDevices = {
    screenRecording: "screenRecording",
    microphone: "microphone",
    accessibility: "accessibility"
  } as const
  
export type AvailablePeripheralDevices = (typeof AvailablePeripheralDevices)[keyof typeof AvailablePeripheralDevices]
  