export const AvailablePeripheralDevices = {
    screenRecording: "screenRecording",
    microphone: "microphone",
    accessibility: "accessibility"
  } as const
  
export type AvailablePeripheralDevicesEnum = (typeof AvailablePeripheralDevices)[keyof typeof AvailablePeripheralDevices]
  